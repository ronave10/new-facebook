import { Injectable } from "@nestjs/common";
import { AiProvider, AnthropicProvider, MockAiProvider } from "@campaignos/ai";
import { loadConfig } from "../core/config";

/** Selects the AI provider by AI_PROVIDER env. Falls back to mock if no key. */
@Injectable()
export class AiProviderFactory {
  private instance: AiProvider | null = null;

  get(): AiProvider {
    if (this.instance) return this.instance;
    const cfg = loadConfig();
    if (cfg.AI_PROVIDER === "anthropic" && cfg.ANTHROPIC_API_KEY) {
      this.instance = new AnthropicProvider({ apiKey: cfg.ANTHROPIC_API_KEY, model: cfg.AI_MODEL });
    } else {
      this.instance = new MockAiProvider();
    }
    return this.instance;
  }
}
