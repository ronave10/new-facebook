import { describe, expect, it } from "vitest";
import { MockMetaConnector } from "../connectors/mock";
import { mapGraphError } from "../error-mapping";
import type { MetaConnector, MetaConnectorContext } from "../connector";

const ctx: MetaConnectorContext = { accessToken: "t", organizationId: "org1" };

describe("MockMetaConnector", () => {
  it("lists seeded assets", async () => {
    const c: MetaConnector = new MockMetaConnector();
    expect((await c.listAdAccounts(ctx)).length).toBeGreaterThanOrEqual(2);
    expect((await c.listPages(ctx, "1")).length).toBeGreaterThanOrEqual(1);
    expect((await c.listCampaigns(ctx, "1")).length).toBeGreaterThanOrEqual(2);
  });

  it("creates entities in PAUSED state (contract invariant)", async () => {
    const c: MetaConnector = new MockMetaConnector();
    const camp = await c.createCampaign(ctx, "1", {
      name: "t",
      objective: "OUTCOME_LEADS",
      specialAdCategories: [],
    });
    expect(camp.status).toBe("PAUSED");
    const as = await c.createAdSet(ctx, "1", {
      campaignId: camp.id,
      name: "as",
      optimizationGoal: "LEAD_GENERATION",
      billingEvent: "IMPRESSIONS",
      targeting: { geoLocations: { countries: ["IL"] } },
    });
    expect(as.status).toBe("PAUSED");
    const cr = await c.createCreative(ctx, "1", { name: "cr", pageId: "p" });
    expect(cr.status).toBe("PAUSED");
    const ad = await c.createAd(ctx, "1", { adSetId: as.id, name: "ad", creativeId: cr.id });
    expect(ad.status).toBe("PAUSED");
  });

  it("activate flips created entity to ACTIVE", async () => {
    const c: MetaConnector = new MockMetaConnector();
    const camp = await c.createCampaign(ctx, "1", { name: "t", objective: "OUTCOME_LEADS", specialAdCategories: [] });
    await c.activateEntity(ctx, "1", "campaign", camp.id);
    const found = (await c.listCampaigns(ctx, "1")).find((x) => x.campaignId === camp.id);
    expect(found?.status).toBe("ACTIVE");
  });

  it("insights are deterministic for the same entity/date", async () => {
    const c: MetaConnector = new MockMetaConnector();
    const a = await c.getInsights(ctx, "1", { level: "campaign", datePreset: "last_7d" });
    const b = await c.getInsights(ctx, "1", { level: "campaign", datePreset: "last_7d" });
    expect(a).toEqual(b);
    expect(a.length).toBe(7);
    expect(a[0].spend).toBeGreaterThan(0);
  });
});

describe("mapGraphError", () => {
  it("maps token expiry (190) to TOKEN_EXPIRED", () => {
    const e = mapGraphError(401, { error: { code: 190, message: "expired" } });
    expect(e.code).toBe("TOKEN_EXPIRED");
  });
  it("maps rate limit (17) to retryable RATE_LIMITED", () => {
    const e = mapGraphError(400, { error: { code: 17 } });
    expect(e.code).toBe("RATE_LIMITED");
    expect(e.retryable).toBe(true);
  });
  it("maps permission (200) to PERMISSION_DENIED", () => {
    expect(mapGraphError(403, { error: { code: 200 } }).code).toBe("PERMISSION_DENIED");
  });
  it("maps invalid param (100) to INVALID_PARAMETER", () => {
    expect(mapGraphError(400, { error: { code: 100 } }).code).toBe("INVALID_PARAMETER");
  });
  it("maps 5xx to retryable TEMPORARY", () => {
    const e = mapGraphError(503, {});
    expect(e.code).toBe("TEMPORARY");
    expect(e.retryable).toBe(true);
  });
});
