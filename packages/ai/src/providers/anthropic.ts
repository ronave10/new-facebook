import Anthropic from "@anthropic-ai/sdk";
import type { AiCompletionRequest, AiCompletionResult, AiProvider } from "../provider";
import { AiProviderError } from "../provider";

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  /** Injectable for tests — defaults to a real Anthropic client. */
  client?: Pick<Anthropic, "messages">;
}

/**
 * Production AI provider backed by the Anthropic Messages API.
 * Forces JSON output, validates against the caller's zod schema, and retries
 * once with a corrective message when the first parse/validation fails.
 */
export class AnthropicProvider implements AiProvider {
  readonly kind = "anthropic" as const;
  private readonly client: Pick<Anthropic, "messages">;
  private readonly model: string;

  constructor(opts: AnthropicProviderOptions) {
    this.model = opts.model;
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey });
  }

  async complete<T>(req: AiCompletionRequest<T>): Promise<AiCompletionResult<T>> {
    const system = `${req.system}\n\nהחזר אך ורק JSON תקין (ללא טקסט נוסף, ללא code fences) התואם למבנה המבוקש.`;
    let lastError = "";
    let promptTokens = 0;
    let completionTokens = 0;

    for (let attempt = 0; attempt < 2; attempt++) {
      const userContent =
        attempt === 0
          ? req.prompt
          : `${req.prompt}\n\nהתשובה הקודמת לא הייתה JSON תקין או לא תאמה למבנה (${lastError}). החזר שוב JSON תקין בלבד.`;

      let response;
      try {
        response = await this.client.messages.create({
          model: this.model,
          max_tokens: req.maxTokens ?? 4096,
          temperature: req.temperature ?? 0.7,
          system,
          messages: [{ role: "user", content: userContent }],
        });
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 429 || status === 529) {
          throw new AiProviderError("ספק ה-AI עמוס כרגע. נסו שוב בעוד רגע.", "RATE_LIMITED", true);
        }
        throw new AiProviderError(
          `שגיאה מספק ה-AI: ${(err as Error).message}`,
          "PROVIDER_ERROR",
        );
      }

      promptTokens = response.usage?.input_tokens ?? 0;
      completionTokens = response.usage?.output_tokens ?? 0;
      const rawText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      const jsonText = stripFences(rawText);
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(jsonText);
      } catch {
        lastError = "JSON parse failed";
        continue;
      }
      const result = req.schema.safeParse(parsedJson);
      if (result.success) {
        return { data: result.data, model: this.model, promptTokens, completionTokens, rawText };
      }
      lastError = result.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    }

    throw new AiProviderError(
      `פלט ה-AI לא תאם למבנה הנדרש: ${lastError}`,
      "INVALID_OUTPUT",
    );
  }
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) return fenced[1].trim();
  // find first { or [ to be forgiving of preamble
  const firstBrace = trimmed.search(/[[{]/);
  if (firstBrace > 0) return trimmed.slice(firstBrace);
  return trimmed;
}
