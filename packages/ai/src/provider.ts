import type { ZodType } from "zod";

/**
 * AI provider abstraction. Implementations: AnthropicProvider (production),
 * MockAiProvider (dev/tests — returns deterministic fixtures keyed by taskKey).
 *
 * Every call is JSON-structured: the caller supplies a zod schema and the provider
 * must return a value that validates against it (retrying internally on mismatch).
 */
export interface AiCompletionRequest<T> {
  /** Stable identifier of the calling agent/task, e.g. "persona.generate" — used by mocks and logging. */
  taskKey: string;
  system: string;
  prompt: string;
  schema: ZodType<T>;
  /** Best-effort upper bound on output tokens. */
  maxTokens?: number;
  temperature?: number;
}

export interface AiCompletionResult<T> {
  data: T;
  model: string;
  promptTokens: number;
  completionTokens: number;
  /** Raw text returned by the model, for hashing/audit. */
  rawText: string;
}

export interface AiProvider {
  readonly kind: "anthropic" | "mock";
  complete<T>(req: AiCompletionRequest<T>): Promise<AiCompletionResult<T>>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly code: "RATE_LIMITED" | "INVALID_OUTPUT" | "PROVIDER_ERROR",
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}
