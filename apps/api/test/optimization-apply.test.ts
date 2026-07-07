import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://x:y@localhost:5432/z";
  process.env.JWT_ACCESS_SECRET = "test-access-secret-000000";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-00000";
  process.env.CREDENTIALS_ENCRYPTION_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
});

const user = { userId: "u1", organizationId: "org1", role: "AGENCY_OWNER", email: "", name: "", clientScope: [] } as const;

function makeService(recOverrides: Record<string, unknown>, campaign: Record<string, unknown> | null) {
  const prisma: any = {
    optimizationRecommendation: {
      findFirst: vi.fn().mockResolvedValue(recOverrides),
      update: vi.fn().mockResolvedValue({}),
    },
    campaign: { findFirst: vi.fn().mockResolvedValue(campaign) },
    approval: { create: vi.fn().mockResolvedValue({ id: "apr1" }) },
    $transaction: vi.fn(async (cb: any) => (typeof cb === "function" ? cb(prisma) : Promise.all(cb))),
  };
  const crypto: any = { hashJson: () => "hash" };
  const audit: any = { log: vi.fn() };
  return { prisma, service: null as any, crypto, audit };
}

async function loadService(deps: any) {
  const { RecommendationsService } = await import("../src/analytics/recommendations.service");
  return new RecommendationsService(deps.prisma, deps.audit, deps.crypto, {} as any);
}

describe("RecommendationsService.apply (safety gate)", () => {
  it("creates a +20% BUDGET_INCREASE approval for a SCALE_BUDGET rec", async () => {
    const deps = makeService(
      { id: "r1", type: "SCALE_BUDGET", status: "NEW", campaignId: "c1", organizationId: "org1" },
      { id: "c1", organizationId: "org1", metaCampaignId: "mc1", budgetAmount: 10000, budgetType: "DAILY", currency: "ILS", clientId: "cl1" },
    );
    const service = await loadService(deps);
    await service.apply(user as any, "r1");
    const call = deps.prisma.approval.create.mock.calls[0][0].data;
    expect(call.entityType).toBe("BUDGET_CHANGE");
    expect(call.action).toBe("BUDGET_INCREASE");
    expect((call.payloadPreview as any).newBudget).toBe(12000); // +20%
    expect(call.status).toBe("PENDING"); // nothing live yet
  });

  it("rejects applying a non-budget recommendation", async () => {
    const deps = makeService({ id: "r2", type: "REFRESH_CREATIVE", status: "NEW", campaignId: "c1", organizationId: "org1" }, null);
    const service = await loadService(deps);
    await expect(service.apply(user as any, "r2")).rejects.toThrow();
  });

  it("rejects re-applying an already-handled recommendation", async () => {
    const deps = makeService({ id: "r3", type: "SCALE_BUDGET", status: "ACKNOWLEDGED", campaignId: "c1", organizationId: "org1" }, null);
    const service = await loadService(deps);
    await expect(service.apply(user as any, "r3")).rejects.toThrow();
  });

  it("rejects when the campaign is not published to Meta", async () => {
    const deps = makeService(
      { id: "r4", type: "REDUCE_BUDGET", status: "NEW", campaignId: "c1", organizationId: "org1" },
      { id: "c1", organizationId: "org1", metaCampaignId: null, budgetAmount: 10000 },
    );
    const service = await loadService(deps);
    await expect(service.apply(user as any, "r4")).rejects.toThrow();
  });
});
