import { describe, expect, it } from "vitest";
import { auditAccount, type AuditInput } from "../account-audit";

const healthy: AuditInput = {
  vertical: "dental",
  pixelConnected: true,
  distinctCreatives: 12,
  distinctVariantStyles: 5,
  hasRemarketingAudience: true,
  hasLookalikeAudience: true,
  campaigns: [{ id: "c1", name: "לידים", status: "PUBLISHED", adSetCount: 2, adCount: 6 }],
  metrics: [
    {
      entityId: "c1",
      entityName: "לידים",
      level: "CAMPAIGN",
      spend: 300,
      impressions: 20000,
      clicks: 300,
      leads: 8,
      conversions: 8,
      daysLive: 7,
      frequency: 1.8,
      ctrPct: 1.5,
    },
  ],
};

describe("auditAccount", () => {
  it("scores a healthy account highly (A/B)", () => {
    const a = auditAccount(healthy);
    expect(a.score).toBeGreaterThanOrEqual(80);
    expect(["A", "B"]).toContain(a.grade);
    expect(a.categories).toHaveLength(6);
    // weights sum to 1
    expect(a.categories.reduce((s, c) => s + c.weight, 0)).toBeCloseTo(1, 5);
  });

  it("flags a no-pixel, low-diversity, cold-audience account (low grade + critical findings)", () => {
    const bad = auditAccount({
      ...healthy,
      pixelConnected: false,
      distinctCreatives: 2,
      distinctVariantStyles: 1,
      hasRemarketingAudience: false,
      hasLookalikeAudience: false,
    });
    expect(bad.score).toBeLessThan(auditAccount(healthy).score);
    expect(bad.findings.some((f) => f.category === "tracking" && f.severity === "CRITICAL")).toBe(true);
    expect(bad.findings.some((f) => f.category === "creative")).toBe(true);
    expect(bad.findings.some((f) => f.category === "audience")).toBe(true);
    expect(["C", "D", "F"]).toContain(bad.grade);
  });

  it("penalizes fragmented structure (too many ad sets)", () => {
    const frag = auditAccount({
      ...healthy,
      campaigns: [{ id: "c1", name: "מפוצל", status: "PUBLISHED", adSetCount: 6, adCount: 18 }],
    });
    const structure = frag.categories.find((c) => c.key === "structure")!;
    expect(structure.score).toBeLessThan(100);
    expect(frag.findings.some((f) => f.category === "structure")).toBe(true);
  });

  it("surfaces a kill-rule finding under performance hygiene", () => {
    const bleeding = auditAccount({
      ...healthy,
      metrics: [
        {
          entityId: "c1",
          entityName: "בזבזן",
          level: "CAMPAIGN",
          spend: 400,
          impressions: 15000,
          clicks: 100,
          leads: 0,
          conversions: 0,
          daysLive: 6,
        },
      ],
    });
    expect(bleeding.findings.some((f) => f.category === "performance")).toBe(true);
  });
});
