import type {
  CreateAdSetSpec,
  CreateAdSpec,
  CreateCampaignSpec,
  CreateCreativeSpec,
  CreateCustomAudienceSpec,
  CreatedEntity,
  MetaCustomAudienceInfo,
  MetaAdAccountInfo,
  MetaAdInfo,
  MetaAdSetInfo,
  MetaCampaignInfo,
  MetaCreativeInfo,
  MetaEntityType,
  MetaIgAccountInfo,
  MetaInsightsQuery,
  MetaInsightsRow,
  MetaLeadInfo,
  MetaPageInfo,
  MetaPixelInfo,
} from "./types";

/**
 * The single abstraction every Meta implementation must satisfy.
 * Implementations: MockMetaConnector (dev/tests), MarketingApiConnector (Graph API v23.0),
 * McpMetaConnector (bridge to a Meta Ads MCP server).
 *
 * INVARIANTS:
 * 1. All create* methods MUST create entities in PAUSED state. Going live happens
 *    exclusively via activateEntity, which the API layer only calls with a consumed
 *    Approval record.
 * 2. Connectors are stateless per call: the access token is passed in the context,
 *    never stored on the connector instance.
 * 3. All errors are normalized to MetaApiError.
 */
export interface MetaConnectorContext {
  accessToken: string;
  /** For logging only — never used to scope data (that happens in the API layer). */
  organizationId: string;
  connectionId?: string;
}

export interface MetaConnector {
  readonly kind: "mock" | "marketing-api" | "mcp";

  // ── Identity / discovery (read) ──
  getMe(ctx: MetaConnectorContext): Promise<{ id: string; name: string }>;
  listAdAccounts(ctx: MetaConnectorContext): Promise<MetaAdAccountInfo[]>;
  listPages(ctx: MetaConnectorContext, adAccountId: string): Promise<MetaPageInfo[]>;
  listPixels(ctx: MetaConnectorContext, adAccountId: string): Promise<MetaPixelInfo[]>;
  listIgAccounts(ctx: MetaConnectorContext, adAccountId: string): Promise<MetaIgAccountInfo[]>;

  // ── Entities (read) ──
  listCampaigns(ctx: MetaConnectorContext, adAccountId: string): Promise<MetaCampaignInfo[]>;
  listAdSets(ctx: MetaConnectorContext, adAccountId: string, campaignId?: string): Promise<MetaAdSetInfo[]>;
  listAds(ctx: MetaConnectorContext, adAccountId: string, adSetId?: string): Promise<MetaAdInfo[]>;
  listCreatives(ctx: MetaConnectorContext, adAccountId: string): Promise<MetaCreativeInfo[]>;

  // ── Insights (read) ──
  getInsights(
    ctx: MetaConnectorContext,
    adAccountId: string,
    query: MetaInsightsQuery,
  ): Promise<MetaInsightsRow[]>;

  // ── Writes — ALWAYS create PAUSED; caller must hold an approved Approval ──
  createCampaign(ctx: MetaConnectorContext, adAccountId: string, spec: CreateCampaignSpec): Promise<CreatedEntity>;
  createAdSet(ctx: MetaConnectorContext, adAccountId: string, spec: CreateAdSetSpec): Promise<CreatedEntity>;
  createCreative(ctx: MetaConnectorContext, adAccountId: string, spec: CreateCreativeSpec): Promise<CreatedEntity>;
  createAd(ctx: MetaConnectorContext, adAccountId: string, spec: CreateAdSpec): Promise<CreatedEntity>;

  /** Flip PAUSED → ACTIVE. The ONLY way anything goes live. */
  activateEntity(
    ctx: MetaConnectorContext,
    adAccountId: string,
    entityType: MetaEntityType,
    entityId: string,
  ): Promise<void>;

  /** Flip ACTIVE → PAUSED. */
  pauseEntity(
    ctx: MetaConnectorContext,
    adAccountId: string,
    entityType: MetaEntityType,
    entityId: string,
  ): Promise<void>;

  /** Update mutable fields (e.g. daily/lifetime budget in minor units) on a live entity. */
  updateEntity(
    ctx: MetaConnectorContext,
    adAccountId: string,
    entityType: MetaEntityType,
    entityId: string,
    fields: { dailyBudget?: number; lifetimeBudget?: number },
  ): Promise<void>;

  /** Fetch a single Lead Ad submission by its lead id (leadgen webhook payload). */
  getLead(ctx: MetaConnectorContext, leadId: string): Promise<MetaLeadInfo>;

  // ── Custom audiences (remarketing / lookalikes) ──
  listCustomAudiences(ctx: MetaConnectorContext, adAccountId: string): Promise<MetaCustomAudienceInfo[]>;
  createCustomAudience(
    ctx: MetaConnectorContext,
    adAccountId: string,
    spec: CreateCustomAudienceSpec,
  ): Promise<{ id: string }>;
  deleteCustomAudience(ctx: MetaConnectorContext, audienceId: string): Promise<void>;
}
