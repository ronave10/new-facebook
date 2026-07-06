import type { MetaConnector, MetaConnectorContext } from "../connector";
import type {
  CreateAdSetSpec,
  CreateAdSpec,
  CreateCampaignSpec,
  CreateCreativeSpec,
  CreatedEntity,
  MetaAdAccountInfo,
  MetaAdInfo,
  MetaAdSetInfo,
  MetaCampaignInfo,
  MetaCreativeInfo,
  MetaEntityType,
  MetaIgAccountInfo,
  MetaInsightsQuery,
  MetaInsightsRow,
  MetaPageInfo,
  MetaPixelInfo,
} from "../types";

/**
 * Minimal transport an MCP client must provide. The API layer wires this to an
 * actual Meta Ads MCP server (per-tenant credentials injected outside this class).
 */
export interface McpTransport {
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

function arr(v: unknown): any[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    for (const key of ["data", "items", "accounts", "pages", "campaigns", "adsets", "ads", "creatives", "results"]) {
      if (Array.isArray(obj[key])) return obj[key] as any[];
    }
  }
  return [];
}

/**
 * Bridges the MetaConnector interface to a Meta Ads MCP server. Normalizes the
 * (loosely-typed) tool responses defensively. Writes still create PAUSED entities.
 */
export class McpMetaConnector implements MetaConnector {
  readonly kind = "mcp" as const;

  constructor(private readonly transport: McpTransport) {}

  async getMe(): Promise<{ id: string; name: string }> {
    const res = (await this.transport.callTool("ads_get_me", {})) as any;
    return { id: res?.id ?? "mcp_user", name: res?.name ?? "MCP User" };
  }

  async listAdAccounts(): Promise<MetaAdAccountInfo[]> {
    const res = await this.transport.callTool("ads_get_ad_accounts", {});
    return arr(res).map((a) => ({
      accountId: String(a.account_id ?? a.id ?? "").replace(/^act_/, ""),
      name: a.name ?? "",
      currency: a.currency ?? "ILS",
      timezone: a.timezone_name ?? a.timezone ?? "Asia/Jerusalem",
      accountStatus: Number(a.account_status ?? 1),
      minDailyBudgetCents: a.min_daily_budget_cents ?? a.min_daily_budget,
    }));
  }

  async listPages(_ctx: MetaConnectorContext, adAccountId: string): Promise<MetaPageInfo[]> {
    const res = await this.transport.callTool("ads_get_ad_account_pages", { ad_account_id: adAccountId });
    return arr(res).map((p) => ({
      pageId: String(p.page_id ?? p.id ?? ""),
      name: p.page_name ?? p.name ?? "",
      category: p.category,
      leadgenTosAccepted: Boolean(p.leadgen_tos_accepted),
    }));
  }

  async listPixels(): Promise<MetaPixelInfo[]> {
    const res = await this.transport.callTool("ads_get_datasets", {}).catch(() => []);
    return arr(res).map((p) => ({ pixelId: String(p.id ?? ""), name: p.name }));
  }

  async listIgAccounts(_ctx: MetaConnectorContext, adAccountId: string): Promise<MetaIgAccountInfo[]> {
    const res = await this.transport.callTool("ads_get_ig_accounts", { ad_account_id: adAccountId }).catch(() => []);
    return arr(res).map((i) => ({ igAccountId: String(i.id ?? i.ig_account_id ?? ""), username: i.username ?? "" }));
  }

  async listCampaigns(_ctx: MetaConnectorContext, adAccountId: string): Promise<MetaCampaignInfo[]> {
    const res = await this.transport.callTool("ads_get_ad_entities", {
      ad_account_id: adAccountId,
      level: "campaign",
    });
    return arr(res).map((c) => ({
      campaignId: String(c.id ?? ""),
      name: c.name ?? "",
      objective: c.objective ?? "",
      status: c.status ?? "PAUSED",
      effectiveStatus: c.effective_status,
      dailyBudget: c.daily_budget ? Number(c.daily_budget) : undefined,
    }));
  }

  async listAdSets(_ctx: MetaConnectorContext, adAccountId: string, campaignId?: string): Promise<MetaAdSetInfo[]> {
    const res = await this.transport.callTool("ads_get_ad_entities", {
      ad_account_id: adAccountId,
      level: "adset",
      ...(campaignId ? { campaign_id: campaignId } : {}),
    });
    return arr(res).map((a) => ({
      adSetId: String(a.id ?? ""),
      campaignId: String(a.campaign_id ?? campaignId ?? ""),
      name: a.name ?? "",
      status: a.status ?? "PAUSED",
      optimizationGoal: a.optimization_goal,
    }));
  }

  async listAds(_ctx: MetaConnectorContext, adAccountId: string, adSetId?: string): Promise<MetaAdInfo[]> {
    const res = await this.transport.callTool("ads_get_ad_entities", {
      ad_account_id: adAccountId,
      level: "ad",
      ...(adSetId ? { adset_id: adSetId } : {}),
    });
    return arr(res).map((a) => ({
      adId: String(a.id ?? ""),
      adSetId: String(a.adset_id ?? adSetId ?? ""),
      campaignId: String(a.campaign_id ?? ""),
      name: a.name ?? "",
      status: a.status ?? "PAUSED",
      creativeId: a.creative?.id ? String(a.creative.id) : undefined,
    }));
  }

  async listCreatives(_ctx: MetaConnectorContext, adAccountId: string): Promise<MetaCreativeInfo[]> {
    const res = await this.transport.callTool("ads_get_creatives", { ad_account_id: adAccountId });
    return arr(res).map((c) => ({
      creativeId: String(c.id ?? ""),
      name: c.name,
      body: c.body,
      title: c.title,
    }));
  }

  async getInsights(
    _ctx: MetaConnectorContext,
    adAccountId: string,
    query: MetaInsightsQuery,
  ): Promise<MetaInsightsRow[]> {
    const res = await this.transport.callTool("ads_insights_performance_trend", {
      ad_account_id: adAccountId,
      level: query.level,
      date_preset: query.datePreset ?? "last_30d",
      ...(query.entityIds?.length ? { entity_ids: query.entityIds } : {}),
    });
    return arr(res).map((r) => ({
      dateStart: r.date_start ?? r.date ?? "",
      dateStop: r.date_stop ?? r.date ?? "",
      level: query.level,
      entityId: String(r.entity_id ?? r.campaign_id ?? adAccountId),
      spend: Number(r.spend ?? 0),
      impressions: Number(r.impressions ?? 0),
      reach: Number(r.reach ?? 0),
      clicks: Number(r.clicks ?? 0),
      ctr: r.ctr ? Number(r.ctr) : undefined,
      cpc: r.cpc ? Number(r.cpc) : undefined,
      cpm: r.cpm ? Number(r.cpm) : undefined,
      leads: Number(r.leads ?? 0),
      conversions: Number(r.conversions ?? r.leads ?? 0),
    }));
  }

  async createCampaign(_ctx: MetaConnectorContext, adAccountId: string, spec: CreateCampaignSpec): Promise<CreatedEntity> {
    const res = (await this.transport.callTool("ads_create_campaign", {
      ad_account_id: adAccountId,
      name: spec.name,
      objective: spec.objective,
      special_ad_categories: spec.specialAdCategories,
      status: "PAUSED",
      ...(spec.dailyBudget ? { campaign_daily_budget: spec.dailyBudget } : {}),
    })) as any;
    return { id: String(res?.id ?? res?.campaign_id ?? ""), status: "PAUSED" };
  }

  async createAdSet(_ctx: MetaConnectorContext, adAccountId: string, spec: CreateAdSetSpec): Promise<CreatedEntity> {
    const res = (await this.transport.callTool("ads_create_ad_set", {
      ad_account_id: adAccountId,
      campaign_id: spec.campaignId,
      ad_set_name: spec.name,
      optimization_goal: spec.optimizationGoal,
      billing_event: spec.billingEvent,
      targeting: JSON.stringify({ geo_locations: spec.targeting.geoLocations }),
      ...(spec.dailyBudget ? { daily_budget: spec.dailyBudget } : {}),
    })) as any;
    return { id: String(res?.id ?? res?.ad_set_id ?? ""), status: "PAUSED" };
  }

  async createCreative(_ctx: MetaConnectorContext, adAccountId: string, spec: CreateCreativeSpec): Promise<CreatedEntity> {
    const res = (await this.transport.callTool("ads_create_creative", {
      ad_account_id: adAccountId,
      page_id: spec.pageId,
      link_url: spec.linkUrl,
      message: spec.message,
      headline: spec.headline,
      description: spec.description,
      call_to_action_type: spec.callToActionType,
      ...(spec.instagramUserId ? { instagram_user_id: spec.instagramUserId } : {}),
    })) as any;
    return { id: String(res?.id ?? res?.creative_id ?? ""), status: "PAUSED" };
  }

  async createAd(_ctx: MetaConnectorContext, adAccountId: string, spec: CreateAdSpec): Promise<CreatedEntity> {
    const res = (await this.transport.callTool("ads_create_ad", {
      ad_account_id: adAccountId,
      adset_id: spec.adSetId,
      name: spec.name,
      creative_id: spec.creativeId,
      status: "PAUSED",
    })) as any;
    return { id: String(res?.id ?? res?.ad_id ?? ""), status: "PAUSED" };
  }

  async activateEntity(_ctx: MetaConnectorContext, adAccountId: string, type: MetaEntityType, id: string): Promise<void> {
    await this.transport.callTool("ads_activate_entity", {
      ad_account_id: adAccountId,
      entity_type: type,
      entity_id: id,
    });
  }

  async pauseEntity(_ctx: MetaConnectorContext, adAccountId: string, _type: MetaEntityType, id: string): Promise<void> {
    await this.transport.callTool("ads_update_entity", {
      ad_account_id: adAccountId,
      entity_id: id,
      status: "PAUSED",
    });
  }
}
