import type { AiCompletionRequest, AiCompletionResult, AiProvider } from "../provider";
import { fillSchema } from "../schema-filler";
import {
  ADS_FIXTURE,
  ANALYTICS_FIXTURE,
  BRAND_EXTRACT_FIXTURE,
  COMPLIANCE_FIXTURE,
  OPTIMIZATION_FIXTURE,
  PERSONA_FIXTURE,
  RESEARCH_FIXTURE,
  STRATEGY_FIXTURE,
} from "../fixtures";

/**
 * Deterministic AI provider for dev/tests. Returns Hebrew fixtures keyed by
 * taskKey; every returned value is re-validated against the caller's schema, and
 * if a fixture does not fit the schema we fall back to a schema-derived filler so
 * the promise NEVER rejects on shape.
 */
export class MockAiProvider implements AiProvider {
  readonly kind = "mock" as const;

  private fixtureFor(taskKey: string): unknown {
    switch (taskKey) {
      case "persona.generate":
        return PERSONA_FIXTURE;
      case "strategy.generate":
        return STRATEGY_FIXTURE;
      case "ads.generate":
        return ADS_FIXTURE;
      case "compliance.review":
        return COMPLIANCE_FIXTURE;
      case "optimization.recommend":
        return OPTIMIZATION_FIXTURE;
      case "research.analyze":
        return RESEARCH_FIXTURE;
      case "brand.extract":
        return BRAND_EXTRACT_FIXTURE;
      case "analytics.summarize":
        return ANALYTICS_FIXTURE;
      default:
        return undefined;
    }
  }

  async complete<T>(req: AiCompletionRequest<T>): Promise<AiCompletionResult<T>> {
    const fixture = this.fixtureFor(req.taskKey);
    let data: T;
    if (fixture !== undefined) {
      const parsed = req.schema.safeParse(fixture);
      data = parsed.success ? parsed.data : fillSchema(req.schema, req.taskKey);
    } else {
      data = fillSchema(req.schema, req.taskKey);
    }
    const rawText = JSON.stringify(data);
    return {
      data,
      model: "mock-ai-v1",
      promptTokens: Math.min(2000, req.prompt.length >> 2),
      completionTokens: Math.min(2000, rawText.length >> 2),
      rawText,
    };
  }
}
