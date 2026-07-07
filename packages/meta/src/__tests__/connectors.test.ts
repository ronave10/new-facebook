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

  it("creates, lists and deletes custom audiences", async () => {
    const c: MetaConnector = new MockMetaConnector();
    const seeded = await c.listCustomAudiences(ctx, "1");
    expect(seeded.length).toBeGreaterThanOrEqual(1);
    const created = await c.createCustomAudience(ctx, "1", { name: "LAL", subtype: "LOOKALIKE", ratio: 0.01 });
    expect(created.id).toContain("mock_aud");
    const after = await c.listCustomAudiences(ctx, "1");
    expect(after.find((a) => a.audienceId === created.id)?.subtype).toBe("LOOKALIKE");
    await c.deleteCustomAudience(ctx, created.id);
    const final = await c.listCustomAudiences(ctx, "1");
    expect(final.find((a) => a.audienceId === created.id)).toBeUndefined();
  });

  it("returns a lead with normalized field data", async () => {
    const c: MetaConnector = new MockMetaConnector();
    const lead = await c.getLead(ctx, "lead_123");
    expect(lead.leadId).toBe("lead_123");
    expect(lead.fieldData.some((f) => f.name === "email")).toBe(true);
  });

  it("searches the ad library for competitor ads", async () => {
    const c: MetaConnector = new MockMetaConnector();
    const ads = await c.searchAdLibrary(ctx, { searchTerms: "רפואת שיניים", countries: ["IL"] });
    expect(ads.length).toBeGreaterThan(0);
    expect(ads[0].pageName).toBeTruthy();
    expect(ads[0].adCreativeBodies.length).toBeGreaterThan(0);
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
