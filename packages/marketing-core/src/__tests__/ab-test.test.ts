import { describe, expect, it } from "vitest";
import {
  evaluateAbTest,
  evaluateByIds,
  evaluateTopTwo,
  normalCdf,
  requiredSampleSizePerVariant,
  twoProportionZTest,
  wilsonInterval,
} from "../ab-test";

describe("normalCdf", () => {
  it("matches known reference values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 5);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.959964)).toBeCloseTo(0.025, 3);
    expect(normalCdf(2.575829)).toBeCloseTo(0.995, 3);
  });
});

describe("twoProportionZTest", () => {
  it("returns p≈1 for identical rates", () => {
    const { p } = twoProportionZTest(50, 1000, 50, 1000);
    expect(p).toBeCloseTo(1, 5);
  });
  it("detects a strong, well-powered difference", () => {
    // 3% vs 6% over 5000 trials each → highly significant
    const { z, p } = twoProportionZTest(150, 5000, 300, 5000);
    expect(Math.abs(z)).toBeGreaterThan(5);
    expect(p).toBeLessThan(0.001);
  });
  it("guards divide-by-zero", () => {
    expect(twoProportionZTest(0, 0, 1, 10).p).toBe(1);
  });
});

describe("evaluateAbTest", () => {
  it("declares a significant winner and orients lift vs control", () => {
    const res = evaluateAbTest(
      { id: "a", label: "הוק כאב", trials: 4000, successes: 240 }, // 6%
      { id: "b", label: "הוק הצעה", trials: 4000, successes: 120 }, // 3%
    );
    expect(res.isSignificant).toBe(true);
    expect(res.winnerId).toBe("a");
    expect(res.control.id).toBe("b"); // lower rate is control
    expect(res.variant.id).toBe("a");
    expect(res.relativeLiftPct).toBeGreaterThan(90); // ~+100%
    expect(res.confidencePct).toBeGreaterThan(99);
    expect(res.recommendation).toContain("מנצחת");
  });

  it("withholds a verdict when the sample is too small", () => {
    const res = evaluateAbTest(
      { id: "a", label: "A", trials: 40, successes: 5 },
      { id: "b", label: "B", trials: 30, successes: 1 },
    );
    expect(res.sufficientSample).toBe(false);
    expect(res.isSignificant).toBe(false);
    expect(res.winnerId).toBeNull();
    expect(res.recommendation).toContain("מספיק דאטה");
  });

  it("reports no significant difference for close, well-powered rates", () => {
    const res = evaluateAbTest(
      { id: "a", label: "A", trials: 5000, successes: 250 }, // 5.0%
      { id: "b", label: "B", trials: 5000, successes: 255 }, // 5.1%
    );
    expect(res.sufficientSample).toBe(true);
    expect(res.isSignificant).toBe(false);
    expect(res.winnerId).toBeNull();
  });
});

describe("wilsonInterval", () => {
  it("brackets the point estimate and stays within [0,1]", () => {
    const ci = wilsonInterval(50, 1000);
    expect(ci.lower).toBeGreaterThan(0);
    expect(ci.lower).toBeLessThan(0.05);
    expect(ci.upper).toBeGreaterThan(0.05);
    expect(ci.upper).toBeLessThanOrEqual(1);
  });
  it("returns zero-width at zero trials", () => {
    expect(wilsonInterval(0, 0)).toEqual({ lower: 0, upper: 0 });
  });
  it("is wider for smaller samples", () => {
    const wide = wilsonInterval(5, 100);
    const narrow = wilsonInterval(500, 10000);
    expect(wide.upper - wide.lower).toBeGreaterThan(narrow.upper - narrow.lower);
  });
});

describe("evaluateAbTest — depth", () => {
  it("attaches Wilson CIs and an absolute-difference CI that excludes 0 when significant", () => {
    const res = evaluateAbTest(
      { id: "a", label: "A", trials: 4000, successes: 240 },
      { id: "b", label: "B", trials: 4000, successes: 120 },
    );
    expect(res.variant.ciLower).toBeLessThan(res.variant.rate);
    expect(res.variant.ciUpper).toBeGreaterThan(res.variant.rate);
    // significant → the 95% CI for the difference should not include 0
    expect(res.diffCiLower).toBeGreaterThan(0);
    expect(res.diffCiUpper).toBeGreaterThan(res.diffCiLower);
  });

  it("projects days-to-significance from the daily traffic rate when underpowered", () => {
    // small-but-trending: 5% vs 6% at 20 trials/day/variant
    const res = evaluateAbTest(
      { id: "a", label: "A", trials: 200, successes: 10 },
      { id: "b", label: "B", trials: 200, successes: 12 },
      "יחס המרה",
      20,
    );
    expect(res.sufficientSample).toBe(true);
    expect(res.isSignificant).toBe(false);
    expect(res.projectedDaysToSignificance).not.toBeNull();
    expect(res.projectedDaysToSignificance!).toBeGreaterThan(0);
    expect(res.recommendation).toContain("ימים");
  });

  it("reports 0 days once significant", () => {
    const res = evaluateAbTest(
      { id: "a", label: "A", trials: 4000, successes: 240 },
      { id: "b", label: "B", trials: 4000, successes: 120 },
      "m",
      100,
    );
    expect(res.projectedDaysToSignificance).toBe(0);
  });
});

describe("evaluateByIds", () => {
  it("compares two explicitly-chosen variants", () => {
    const vs = [
      { id: "a", label: "A", trials: 4000, successes: 240 },
      { id: "b", label: "B", trials: 4000, successes: 120 },
      { id: "c", label: "C", trials: 9000, successes: 300 },
    ];
    const res = evaluateByIds(vs, "a", "b");
    expect(res).not.toBeNull();
    expect([res!.control.id, res!.variant.id].sort()).toEqual(["a", "b"]);
  });
  it("returns null for unknown or identical ids", () => {
    const vs = [{ id: "a", label: "A", trials: 100, successes: 5 }];
    expect(evaluateByIds(vs, "a", "a")).toBeNull();
    expect(evaluateByIds(vs, "a", "zzz")).toBeNull();
  });
});

describe("evaluateTopTwo", () => {
  it("picks the two highest-traffic variants", () => {
    const res = evaluateTopTwo([
      { id: "a", label: "A", trials: 5000, successes: 300 },
      { id: "b", label: "B", trials: 4800, successes: 150 },
      { id: "c", label: "C", trials: 20, successes: 1 },
    ]);
    expect(res).not.toBeNull();
    expect([res!.control.id, res!.variant.id].sort()).toEqual(["a", "b"]);
  });
  it("returns null without two trafficked variants", () => {
    expect(evaluateTopTwo([{ id: "a", label: "A", trials: 100, successes: 5 }])).toBeNull();
  });
});

describe("requiredSampleSizePerVariant", () => {
  it("needs a larger sample to detect a smaller effect", () => {
    const small = requiredSampleSizePerVariant(0.05, 0.1); // detect +10%
    const large = requiredSampleSizePerVariant(0.05, 0.5); // detect +50%
    expect(small).toBeGreaterThan(large);
    expect(large).toBeGreaterThan(0);
  });
});
