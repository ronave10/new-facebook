import { describe, expect, it } from "vitest";
import { cplBenchmark, normalizeVertical, verdictLowerIsBetter } from "../benchmarks";
import { canLookalike, canRemarket, recommendBudgetTier, EMPTY_PIXEL_STATS } from "../budget-tiers";
import { evaluateRules, ruleK1, ruleS1, type EntityMetrics, type RuleTargets } from "../optimization-rules";
import { checkCompliance } from "../compliance";

const targets: RuleTargets = { targetCpaIls: 40, cpmP50: 35 };
const base: EntityMetrics = {
  entityId: "e1",
  entityName: "מודעה",
  level: "AD",
  spend: 0,
  impressions: 0,
  clicks: 0,
  leads: 0,
  conversions: 0,
  daysLive: 5,
};

describe("benchmarks", () => {
  it("normalizes Hebrew verticals", () => {
    expect(normalizeVertical("רפואת שיניים אסתטית")).toBe("dental");
    expect(normalizeVertical("מכון כושר")).toBe("fitness");
    expect(normalizeVertical("שיפוצים ומיזוג")).toBe("home_services");
  });
  it("returns a CPL benchmark and verdict", () => {
    const b = cplBenchmark("dental");
    expect(b.p50).toBe(80);
    expect(verdictLowerIsBetter(30, b)).toBe("strong");
    expect(verdictLowerIsBetter(80, b)).toBe("typical");
    expect(verdictLowerIsBetter(200, b)).toBe("alert");
  });
});

describe("budget tiers", () => {
  it("tier A under ₪100 has a single ad set, no remarketing", () => {
    const t = recommendBudgetTier(80);
    expect(t.tier).toBe("A");
    expect(t.allocations).toHaveLength(1);
  });
  it("tier B adds remarketing only when warm audience exists", () => {
    const cold = recommendBudgetTier(200, EMPTY_PIXEL_STATS);
    expect(cold.allocations.some((a) => a.name.includes("רימרקטינג"))).toBe(false);
    const warm = recommendBudgetTier(200, { ...EMPTY_PIXEL_STATS, siteVisitors30d: 5000 });
    expect(warm.allocations.some((a) => a.name.includes("רימרקטינג"))).toBe(true);
  });
  it("audience gates", () => {
    expect(canRemarket({ ...EMPTY_PIXEL_STATS, pageEngagers90d: 10 })).toBe(true);
    expect(canRemarket(EMPTY_PIXEL_STATS)).toBe(false);
    expect(canLookalike({ ...EMPTY_PIXEL_STATS, customerListSize: 150 })).toBe(true);
    expect(canLookalike({ ...EMPTY_PIXEL_STATS, customerListSize: 50 })).toBe(false);
  });
});

describe("optimization rules", () => {
  it("K1 fires only past the 3x gate with zero results", () => {
    expect(ruleK1({ ...base, spend: 80, leads: 0 }, targets)).toBeNull(); // 2x, gate not passed
    const f = ruleK1({ ...base, spend: 130, leads: 0 }, targets); // 3.25x
    expect(f?.ruleId).toBe("K1");
    expect(f?.severity).toBe("CRITICAL");
  });
  it("S1 fires for a steady winner", () => {
    const f = ruleS1({ ...base, spend: 160, leads: 6, daysLive: 4 }, targets); // CPA 26.6 ≤ 32
    expect(f?.ruleId).toBe("S1");
  });
  it("evaluateRules respects statistical gates and dedups per entity", () => {
    const underpowered: EntityMetrics = { ...base, entityId: "u", spend: 20, impressions: 500, daysLive: 1 };
    expect(evaluateRules([underpowered], targets)).toHaveLength(0);
    const killable: EntityMetrics = { ...base, entityId: "k", spend: 200, leads: 0, impressions: 12000, daysLive: 5 };
    const findings = evaluateRules([killable], targets);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].severity).toBe("CRITICAL");
  });
});

describe("compliance engine", () => {
  it("BLOCKs unrealistic guarantees", () => {
    const r = checkCompliance("תוצאה מובטחת ב-100% הצלחה!");
    expect(r.verdict).toBe("BLOCK");
    expect(r.findings.some((f) => f.ruleId === "C2")).toBe(true);
  });
  it("BLOCKs personal-attribute assertions", () => {
    expect(checkCompliance("אתה סובל מכאבי גב?").verdict).toBe("BLOCK");
  });
  it("BLOCKs before/after in sensitive verticals only", () => {
    expect(checkCompliance("תמונות לפני/אחרי", { vertical: "dental" }).verdict).toBe("BLOCK");
    expect(checkCompliance("תמונות לפני/אחרי", { vertical: "home_services" }).verdict).toBe("PASS");
  });
  it("BLOCKs client forbidden words", () => {
    const r = checkCompliance("הצעה מדהימה", { forbiddenWords: ["מדהימה"] });
    expect(r.verdict).toBe("BLOCK");
  });
  it("passes clean copy", () => {
    expect(checkCompliance("קבעו שיחת ייעוץ ללא התחייבות ותגלו איך נוכל לעזור.").verdict).toBe("PASS");
  });
});
