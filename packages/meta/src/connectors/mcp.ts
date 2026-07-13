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
  AdLibraryAd,
  AdLibraryQuery,
  CreateCustomAudienceSpec,
  MetaCustomAudienceInfo,
  MetaInsightsRow,
  MetaInterest,
  MetaLeadInfo,
  MetaPageInfo,
  MetaPixelInfo,
  InterestSearchQuery,
  SplitTestSpec,
  SplitTestInfo,
  SplitTestStatus,
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

  async updateEntity(
    _ctx: MetaConnectorContext,
    adAccountId: string,
    _type: MetaEntityType,
    id: string,
    fields: { dailyBudget?: number; lifetimeBudget?: number },
  ): Promise<void> {
    await this.transport.callTool("ads_update_entity", {
      ad_account_id: adAccountId,
      entity_id: id,
      ...(fields.dailyBudget !== undefined ? { daily_budget: fields.dailyBudget } : {}),
      ...(fields.lifetimeBudget !== undefined ? { lifetime_budget: fields.lifetimeBudget } : {}),
    });
  }

  async listCustomAudiences(_ctx: MetaConnectorContext, adAccountId: string): Promise<MetaCustomAudienceInfo[]> {
    const res = await this.transport.callTool("ads_get_ad_account_custom_audiences", { ad_account_id: adAccountId });
    return arr(res).map((a) => ({
      audienceId: String(a.id ?? ""),
      name: a.name ?? "",
      subtype: (a.subtype ?? "CUSTOM") as MetaCustomAudienceInfo["subtype"],
      description: a.description,
      approximateCount: a.approximate_count_upper_bound ?? a.approximate_count,
    }));
  }

  async createCustomAudience(
    _ctx: MetaConnectorContext,
    adAccountId: string,
    spec: CreateCustomAudienceSpec,
  ): Promise<{ id: string }> {
    const res = (await this.transport.callTool("ads_create_custom_audience", {
      ad_account_id: adAccountId,
      name: spec.name,
      subtype: spec.subtype,
      ...(spec.description ? { description: spec.description } : {}),
      ...(spec.subtype === "LOOKALIKE"
        ? { origin_audience_id: spec.originAudienceId, lookalike_ratio: spec.ratio ?? 0.01 }
        : {}),
    })) as any;
    return { id: String(res?.id ?? res?.audience_id ?? "") };
  }

  async deleteCustomAudience(_ctx: MetaConnectorContext, audienceId: string): Promise<void> {
    await this.transport.callTool("ads_delete_custom_audience", { audience_id: audienceId });
  }

  async searchAdLibrary(_ctx: MetaConnectorContext, query: AdLibraryQuery): Promise<AdLibraryAd[]> {
    const res = await this.transport.callTool("ads_library_search", {
      ...(query.searchTerms ? { search_terms: query.searchTerms } : {}),
      ...(query.pageIds?.length ? { page_ids: query.pageIds } : {}),
      countries: query.countries ?? ["IL"],
      limit: query.limit ?? 25,
    });
    return arr(res).map((a) => ({
      pageId: String(a.page_id ?? ""),
      pageName: a.page_name ?? "",
      adCreativeBodies: a.ad_creative_bodies ?? (a.ad_creative_body ? [a.ad_creative_body] : []),
      adCreativeTitles: a.ad_creative_link_titles ?? [],
      adSnapshotUrl: a.ad_snapshot_url,
      publisherPlatforms: a.publisher_platforms,
      createdTime: a.ad_creation_time ?? a.ad_delivery_start_time,
    }));
  }

  async searchInterests(_ctx: MetaConnectorContext, query: InterestSearchQuery): Promise<MetaInterest[]> {
    const res = await this.transport.callTool("ads_get_field_context", {
      field: "targeting.interests",
      q: query.q,
      limit: query.limit ?? 20,
    });
    return arr(res).map((r) => ({
      id: String(r.id ?? ""),
      name: r.name ?? "",
      type: (r.type ?? "interests") as MetaInterest["type"],
      audienceSizeLower: r.audience_size_lower_bound ?? r.audience_size,
      audienceSizeUpper: r.audience_size_upper_bound,
      path: r.path,
      topic: r.topic,
    }));
  }

  async createSplitTest(
    _ctx: MetaConnectorContext,
    adAccountId: string,
    spec: SplitTestSpec,
  ): Promise<{ id: string; status: SplitTestStatus }> {
    const res = await this.transport.callTool("ads_experiment_abtest_create_test", {
      ad_account_id: adAccountId,
      name: spec.name,
      metric: spec.metric,
      cells: spec.cells.map((c) => ({ name: c.name, entity_id: c.metaEntityId })),
      ...(spec.startTime ? { start_time: spec.startTime } : {}),
      ...(spec.endTime ? { end_time: spec.endTime } : {}),
    });
    const row = arr(res)[0] ?? (res as any);
    return { id: String(row?.id ?? row?.test_id ?? ""), status: "RUNNING" };
  }

  async getSplitTest(_ctx: MetaConnectorContext, testId: string): Promise<SplitTestInfo> {
    const res = await this.transport.callTool("ads_experiment_abtest_get_test", { test_id: testId });
    const row = arr(res)[0] ?? (res as any);
    const cells = (row?.cells ?? []).map((c: any) => ({
      id: String(c.id ?? ""),
      name: c.name ?? "",
      metaEntityId: c.entity_id,
      impressions: Number(c.impressions ?? 0),
      clicks: Number(c.clicks ?? 0),
      conversions: Number(c.conversions ?? c.results ?? 0),
    }));
    return {
      id: String(row?.id ?? testId),
      name: row?.name ?? "",
      status: (row?.status ?? "RUNNING") as SplitTestStatus,
      cells,
      winnerCellId: row?.winner_cell_id,
      startTime: row?.start_time,
      endTime: row?.end_time,
    };
  }

  async stopSplitTest(_ctx: MetaConnectorContext, _adAccountId: string, testId: string): Promise<void> {
    await this.transport.callTool("ads_experiment_abtest_update_test", { test_id: testId, action: "STOP" });
  }

  async getLead(_ctx: MetaConnectorContext, leadId: string): Promise<MetaLeadInfo> {
    const res = (await this.transport.callTool("ads_get_lead", { lead_id: leadId })) as any;
    return {
      leadId: String(res?.id ?? leadId),
      formId: res?.form_id,
      adId: res?.ad_id,
      campaignId: res?.campaign_id,
      createdTime: res?.created_time,
      fieldData: (res?.field_data ?? []).map((f: any) => ({ name: f.name, values: f.values ?? [] })),
    };
  }
}
