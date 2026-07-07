import { describe, expect, it } from "vitest";
import { MockAiProvider } from "../providers/mock";
import { fillSchema } from "../schema-filler";
import { z } from "zod";

const provider = new MockAiProvider();

const personaSchema = z.array(
  z.object({
    name: z.string(),
    pains: z.array(z.string()),
    desires: z.array(z.string()),
    fears: z.array(z.string()),
    objections: z.array(z.string()),
    emotionalTriggers: z.array(z.string()),
    conversionDrivers: z.array(z.string()),
    distrustTriggers: z.array(z.string()),
    matchingOffers: z.array(z.string()),
    campaignAngles: z.array(z.string()),
  }),
);

describe("MockAiProvider", () => {
  it("returns schema-valid personas", async () => {
    const res = await provider.complete({
      taskKey: "persona.generate",
      system: "s",
      prompt: "p",
      schema: personaSchema,
    });
    expect(res.data.length).toBeGreaterThanOrEqual(3);
    expect(res.data[0].name).toBeTruthy();
    expect(res.model).toBe("mock-ai-v1");
  });

  it("returns a schema-valid brand DNA extraction", async () => {
    const brandExtractSchema = z.object({
      suggestedIndustry: z.string(),
      mainProduct: z.string(),
      keyBenefits: z.array(z.string()),
      differentiation: z.string(),
      customerPains: z.array(z.string()),
      commonObjections: z.array(z.string()),
      brandTone: z.string(),
    });
    const res = await provider.complete({
      taskKey: "brand.extract",
      system: "s",
      prompt: "p",
      schema: brandExtractSchema,
    });
    expect(res.data.keyBenefits.length).toBeGreaterThan(0);
    expect(res.data.mainProduct).toBeTruthy();
    expect(brandExtractSchema.safeParse(res.data).success).toBe(true);
  });

  it("falls back to schema filler for unknown taskKey", async () => {
    const schema = z.object({ foo: z.string(), bar: z.number(), items: z.array(z.string()) });
    const res = await provider.complete({ taskKey: "unknown.task", system: "s", prompt: "p", schema });
    expect(typeof res.data.foo).toBe("string");
    expect(typeof res.data.bar).toBe("number");
    expect(Array.isArray(res.data.items)).toBe(true);
  });
});

describe("fillSchema", () => {
  it("produces values that validate against nested schemas", () => {
    const schema = z.object({
      a: z.string().email(),
      b: z.enum(["X", "Y"]),
      c: z.array(z.object({ n: z.number() })).min(2),
      d: z.boolean().optional(),
    });
    const value = fillSchema(schema);
    expect(schema.safeParse(value).success).toBe(true);
  });
});
