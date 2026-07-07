import type { MetaConnector, MetaConnectorContext } from "../connector";
import { mapGraphError } from "../error-mapping";
import {
  MetaApiError,
  type CreateAdSetSpec,
  type CreateAdSpec,
  type CreateCampaignSpec,
  type CreateCreativeSpec,
  type CreatedEntity,
  type MetaAdAccountInfo,
  type MetaAdInfo,
  type MetaAdSetInfo,
  type MetaCampaignInfo,
  type MetaCreativeInfo,
  type MetaEntityType,
  type MetaIgAccountInfo,
  type MetaInsightsQuery,
  type AdLibraryAd,
  type AdLibraryQuery,
  type CreateCustomAudienceSpec,
  type MetaCustomAudienceInfo,
  type MetaInsightsRow,
  type MetaInterest,
  type MetaLeadInfo,
  type MetaPageInfo,
  type MetaPixelInfo,
  type InterestSearchQuery,
} from "../types";

export interface MarketingApiOptions {
  graphVersion: string; // e.g. "v23.0"
  appId?: string;
  appSecret?: string;
  /** Injectable fetch for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Real Meta Marketing API connector over the Graph API. Every write creates
 * entities in PAUSED state; activation is a separate explicit call.
 */
export class MarketingApiConnector implements MetaConnector {
  readonly kind = "marketing-api" as const;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: MarketingApiOptions) {
    this.base = `https://graph.facebook.com/${opts.graphVersion}`;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  // ── OAuth helpers ──

  buildAuthUrl(params: { redirectUri: string; scopes: string[]; state: string; configId?: string }): string {
    const q = new URLSearchParams({
      client_id: this.opts.appId ?? "",
      redirect_uri: params.redirectUri,
      state: params.state,
      response_type: "code",
      scope: params.scopes.join(","),
    });
    if (params.configId) q.set("config_id", params.configId);
    return `https://www.facebook.com/${this.opts.graphVersion}/dialog/oauth?${q.toString()}`;
  }

  async exchangeCodeForToken(code: string, redirectUri: string): Promise<{ accessToken: string; expiresIn?: number }> {
    const q = new URLSearchParams({
      client_id: this.opts.appId ?? "",
      client_secret: this.opts.appSecret ?? "",
      redirect_uri: redirectUri,
      code,
    });
    const data = await this.raw<{ access_token: string; expires_in?: number }>(
      `${this.base}/oauth/access_token?${q.toString()}`,
    );
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }

  async getLongLivedToken(shortToken: string): Promise<{ accessToken: string; expiresIn?: number }> {
    const q = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: this.opts.appId ?? "",
      client_secret: this.opts.appSecret ?? "",
      fb_exchange_token: shortToken,
    });
    const data = await this.raw<{ access_token: string; expires_in?: number }>(
      `${this.base}/oauth/access_token?${q.toString()}`,
    );
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }

  // ── Reads ──

  async getMe(ctx: MetaConnectorContext): Promise<{ id: string; name: string }> {
    return this.get(ctx, "/me", { fields: "id,name" });
  }

  async listAdAccounts(ctx: MetaConnectorContext): Promise<MetaAdAccountInfo[]> {
    const res = await this.get<{ data: any[] }>(ctx, "/me/adaccounts", {
      fields: "account_id,name,currency,timezone_name,account_status,min_daily_budget,business",
      limit: "200",
    });
    return (res.data ?? []).map((a) => ({
      accountId: a.account_id,
      name: a.name,
      currency: a.currency,
      timezone: a.timezone_name,
      accountStatus: a.account_status,
      minDailyBudgetCents: a.min_daily_budget ? Number(a.min_daily_budget) : undefined,
      business: a.business ? { id: a.business.id, name: a.business.name } : undefined,
    }));
  }

  async listPages(ctx: MetaConnectorContext, adAccountId: string): Promise<MetaPageInfo[]> {
    const res = await this.get<{ data: any[] }>(ctx, `/act_${adAccountId}/promote_pages`, {
      fields: "id,name,category,leadgen_tos_accepted",
      limit: "200",
    }).catch(() => this.get<{ data: any[] }>(ctx, "/me/accounts", { fields: "id,name,category", limit: "200" }));
    return (res.data ?? []).map((p) => ({
      pageId: p.id,
      name: p.name,
      category: p.category,
      leadgenTosAccepted: Boolean(p.leadgen_tos_accepted),
    }));
  }

  async listPixels(ctx: MetaConnectorContext, adAccountId: string): Promise<MetaPixelInfo[]> {
    const res = await this.get<{ data: any[] }>(ctx, `/act_${adAccountId}/adspixels`, {
      fields: "id,name",
      limit: "100",
    });
    return (res.data ?? []).map((p) => ({ pixelId: p.id, name: p.name, adAccountId }));
  }

  async listIgAccounts(ctx: MetaConnectorContext, adAccountId: string): Promise<MetaIgAccountInfo[]> {
    const res = await this.get<{ data: any[] }>(ctx, `/act_${adAccountId}/instagram_accounts`, {
      fields: "id,username",
      limit: "50",
    }).catch(() => ({ data: [] as any[] }));
    return (res.data ?? []).map((i) => ({ igAccountId: i.id, username: i.username }));
  }

  async listCampaigns(ctx: MetaConnectorContext, adAccountId: string): Promise<MetaCampaignInfo[]> {
    const res = await this.get<{ data: any[] }>(ctx, `/act_${adAccountId}/campaigns`, {
      fields:
        "id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time,special_ad_categories,created_time",
      limit: "200",
    });
    return (res.data ?? []).map((c) => ({
      campaignId: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      effectiveStatus: c.effective_status,
      dailyBudget: c.daily_budget ? Number(c.daily_budget) : undefined,
      lifetimeBudget: c.lifetime_budget ? Number(c.lifetime_budget) : undefined,
      startTime: c.start_time,
      stopTime: c.stop_time,
      specialAdCategories: c.special_ad_categories,
      createdTime: c.created_time,
    }));
  }

  async listAdSets(ctx: MetaConnectorContext, adAccountId: string, campaignId?: string): Promise<MetaAdSetInfo[]> {
    const path = campaignId ? `/${campaignId}/adsets` : `/act_${adAccountId}/adsets`;
    const res = await this.get<{ data: any[] }>(ctx, path, {
      fields: "id,campaign_id,name,status,optimization_goal,billing_event,daily_budget,lifetime_budget,targeting,start_time,end_time",
      limit: "200",
    });
    return (res.data ?? []).map((a) => ({
      adSetId: a.id,
      campaignId: a.campaign_id,
      name: a.name,
      status: a.status,
      optimizationGoal: a.optimization_goal,
      billingEvent: a.billing_event,
      dailyBudget: a.daily_budget ? Number(a.daily_budget) : undefined,
      lifetimeBudget: a.lifetime_budget ? Number(a.lifetime_budget) : undefined,
      targeting: a.targeting,
      startTime: a.start_time,
      endTime: a.end_time,
    }));
  }

  async listAds(ctx: MetaConnectorContext, adAccountId: string, adSetId?: string): Promise<MetaAdInfo[]> {
    const path = adSetId ? `/${adSetId}/ads` : `/act_${adAccountId}/ads`;
    const res = await this.get<{ data: any[] }>(ctx, path, {
      fields: "id,adset_id,campaign_id,name,status,creative",
      limit: "300",
    });
    return (res.data ?? []).map((a) => ({
      adId: a.id,
      adSetId: a.adset_id,
      campaignId: a.campaign_id,
      name: a.name,
      status: a.status,
      creativeId: a.creative?.id,
    }));
  }

  async listCreatives(ctx: MetaConnectorContext, adAccountId: string): Promise<MetaCreativeInfo[]> {
    const res = await this.get<{ data: any[] }>(ctx, `/act_${adAccountId}/adcreatives`, {
      fields: "id,name,body,title,image_url,thumbnail_url,call_to_action_type,object_type",
      limit: "200",
    });
    return (res.data ?? []).map((c) => ({
      creativeId: c.id,
      name: c.name,
      body: c.body,
      title: c.title,
      imageUrl: c.image_url,
      thumbnailUrl: c.thumbnail_url,
      callToActionType: c.call_to_action_type,
      objectType: c.object_type,
    }));
  }

  async getInsights(
    ctx: MetaConnectorContext,
    adAccountId: string,
    query: MetaInsightsQuery,
  ): Promise<MetaInsightsRow[]> {
    const params: Record<string, string> = {
      level: query.level,
      fields:
        "spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values,cost_per_action_type,purchase_roas,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,date_start,date_stop",
      limit: "500",
    };
    if (query.datePreset) params.date_preset = query.datePreset;
    if (query.since && query.until) params.time_range = JSON.stringify({ since: query.since, until: query.until });
    if (query.timeIncrement) params.time_increment = String(query.timeIncrement);
    if (query.entityIds?.length) params.filtering = JSON.stringify([
      { field: `${query.level}.id`, operator: "IN", value: query.entityIds },
    ]);

    const res = await this.get<{ data: any[] }>(ctx, `/act_${adAccountId}/insights`, params);
    return (res.data ?? []).map((r) => this.normalizeInsight(r, query.level));
  }

  // ── Writes (PAUSED-first) ──

  async createCampaign(ctx: MetaConnectorContext, adAccountId: string, spec: CreateCampaignSpec): Promise<CreatedEntity> {
    const body: Record<string, unknown> = {
      name: spec.name,
      objective: spec.objective,
      status: "PAUSED",
      special_ad_categories: JSON.stringify(spec.specialAdCategories ?? []),
    };
    if (spec.dailyBudget) body.daily_budget = spec.dailyBudget;
    if (spec.lifetimeBudget) body.lifetime_budget = spec.lifetimeBudget;
    const res = await this.post<{ id: string }>(ctx, `/act_${adAccountId}/campaigns`, body);
    return { id: res.id, status: "PAUSED" };
  }

  async createAdSet(ctx: MetaConnectorContext, adAccountId: string, spec: CreateAdSetSpec): Promise<CreatedEntity> {
    const body: Record<string, unknown> = {
      name: spec.name,
      campaign_id: spec.campaignId,
      optimization_goal: spec.optimizationGoal,
      billing_event: spec.billingEvent,
      status: "PAUSED",
      targeting: JSON.stringify(this.buildTargeting(spec)),
    };
    if (spec.dailyBudget) body.daily_budget = spec.dailyBudget;
    if (spec.lifetimeBudget) body.lifetime_budget = spec.lifetimeBudget;
    if (spec.startTime) body.start_time = spec.startTime;
    if (spec.endTime) body.end_time = spec.endTime;
    if (spec.destinationType) body.destination_type = spec.destinationType;
    if (spec.promotedObject) {
      body.promoted_object = JSON.stringify({
        ...(spec.promotedObject.pixelId ? { pixel_id: spec.promotedObject.pixelId } : {}),
        ...(spec.promotedObject.pageId ? { page_id: spec.promotedObject.pageId } : {}),
        ...(spec.promotedObject.customEventType ? { custom_event_type: spec.promotedObject.customEventType } : {}),
      });
    }
    if (spec.dsaBeneficiary) body.dsa_beneficiary = spec.dsaBeneficiary;
    if (spec.dsaPayor) body.dsa_payor = spec.dsaPayor;
    const res = await this.post<{ id: string }>(ctx, `/act_${adAccountId}/adsets`, body);
    return { id: res.id, status: "PAUSED" };
  }

  async createCreative(ctx: MetaConnectorContext, adAccountId: string, spec: CreateCreativeSpec): Promise<CreatedEntity> {
    const linkData: Record<string, unknown> = {
      message: spec.message,
      link: spec.linkUrl,
      name: spec.headline,
      description: spec.description,
      call_to_action: spec.callToActionType
        ? { type: spec.callToActionType, value: { link: spec.linkUrl } }
        : undefined,
    };
    if (spec.imageHash) linkData.image_hash = spec.imageHash;
    const body: Record<string, unknown> = {
      name: spec.name,
      object_story_spec: JSON.stringify({
        page_id: spec.pageId,
        ...(spec.instagramUserId ? { instagram_user_id: spec.instagramUserId } : {}),
        link_data: linkData,
      }),
    };
    const res = await this.post<{ id: string }>(ctx, `/act_${adAccountId}/adcreatives`, body);
    return { id: res.id, status: "PAUSED" };
  }

  async createAd(ctx: MetaConnectorContext, adAccountId: string, spec: CreateAdSpec): Promise<CreatedEntity> {
    const body = {
      name: spec.name,
      adset_id: spec.adSetId,
      creative: JSON.stringify({ creative_id: spec.creativeId }),
      status: "PAUSED",
    };
    const res = await this.post<{ id: string }>(ctx, `/act_${adAccountId}/ads`, body);
    return { id: res.id, status: "PAUSED" };
  }

  async activateEntity(ctx: MetaConnectorContext, _acct: string, _type: MetaEntityType, id: string): Promise<void> {
    await this.post(ctx, `/${id}`, { status: "ACTIVE" });
  }

  async pauseEntity(ctx: MetaConnectorContext, _acct: string, _type: MetaEntityType, id: string): Promise<void> {
    await this.post(ctx, `/${id}`, { status: "PAUSED" });
  }

  async updateEntity(
    ctx: MetaConnectorContext,
    _acct: string,
    _type: MetaEntityType,
    id: string,
    fields: { dailyBudget?: number; lifetimeBudget?: number },
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (fields.dailyBudget !== undefined) body.daily_budget = fields.dailyBudget;
    if (fields.lifetimeBudget !== undefined) body.lifetime_budget = fields.lifetimeBudget;
    if (Object.keys(body).length === 0) return;
    await this.post(ctx, `/${id}`, body);
  }

  async listCustomAudiences(ctx: MetaConnectorContext, adAccountId: string): Promise<MetaCustomAudienceInfo[]> {
    const res = await this.get<{ data: any[] }>(ctx, `/act_${adAccountId}/customaudiences`, {
      fields: "id,name,subtype,description,approximate_count_lower_bound,approximate_count_upper_bound",
      limit: "200",
    });
    return (res.data ?? []).map((a) => ({
      audienceId: a.id,
      name: a.name,
      subtype: (a.subtype ?? "CUSTOM") as MetaCustomAudienceInfo["subtype"],
      description: a.description,
      approximateCount: a.approximate_count_upper_bound ?? a.approximate_count_lower_bound,
    }));
  }

  async createCustomAudience(
    ctx: MetaConnectorContext,
    adAccountId: string,
    spec: CreateCustomAudienceSpec,
  ): Promise<{ id: string }> {
    const body: Record<string, unknown> = { name: spec.name, subtype: spec.subtype };
    if (spec.description) body.description = spec.description;
    if (spec.subtype === "WEBSITE" && spec.pixelId) {
      body.rule = JSON.stringify({
        inclusions: {
          operator: "or",
          rules: [
            {
              event_sources: [{ type: "pixel", id: spec.pixelId }],
              retention_seconds: (spec.retentionDays ?? 30) * 86400,
              filter: { operator: "and", filters: [{ field: "url", operator: "i_contains", value: "" }] },
              template: "ALL_VISITORS",
            },
          ],
        },
      });
    } else if (spec.subtype === "ENGAGEMENT" && spec.pageId) {
      body.rule = JSON.stringify({
        inclusions: {
          operator: "or",
          rules: [
            {
              event_sources: [{ type: "page", id: spec.pageId }],
              retention_seconds: (spec.retentionDays ?? 90) * 86400,
            },
          ],
        },
      });
    } else if (spec.subtype === "LOOKALIKE" && spec.originAudienceId) {
      body.origin_audience_id = spec.originAudienceId;
      body.lookalike_spec = JSON.stringify({
        ratio: spec.ratio ?? 0.01,
        country: spec.country ?? "IL",
        type: "similarity",
      });
    }
    const res = await this.post<{ id: string }>(ctx, `/act_${adAccountId}/customaudiences`, body);
    return { id: res.id };
  }

  async deleteCustomAudience(ctx: MetaConnectorContext, audienceId: string): Promise<void> {
    await this.raw(`${this.base}/${audienceId}?access_token=${encodeURIComponent(ctx.accessToken)}`, {
      method: "DELETE",
    });
  }

  async searchAdLibrary(ctx: MetaConnectorContext, query: AdLibraryQuery): Promise<AdLibraryAd[]> {
    const params: Record<string, string> = {
      ad_type: "ALL",
      ad_active_status: "ACTIVE",
      fields: "page_id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_snapshot_url,publisher_platforms,ad_creation_time",
      limit: String(query.limit ?? 25),
    };
    if (query.searchTerms) params.search_terms = query.searchTerms;
    if (query.pageIds?.length) params.search_page_ids = query.pageIds.join(",");
    params.ad_reached_countries = JSON.stringify(query.countries ?? ["IL"]);
    const res = await this.get<{ data: any[] }>(ctx, "/ads_archive", params);
    return (res.data ?? []).map((a) => ({
      pageId: a.page_id,
      pageName: a.page_name,
      adCreativeBodies: a.ad_creative_bodies ?? [],
      adCreativeTitles: a.ad_creative_link_titles ?? [],
      adSnapshotUrl: a.ad_snapshot_url,
      publisherPlatforms: a.publisher_platforms,
      createdTime: a.ad_creation_time,
    }));
  }

  async searchInterests(ctx: MetaConnectorContext, query: InterestSearchQuery): Promise<MetaInterest[]> {
    const res = await this.get<{ data: any[] }>(ctx, "/search", {
      type: "adinterest",
      q: query.q,
      limit: String(query.limit ?? 20),
    });
    return (res.data ?? []).map((r) => ({
      id: String(r.id),
      name: r.name,
      type: (r.type ?? "interests") as MetaInterest["type"],
      audienceSizeLower: r.audience_size_lower_bound ?? r.audience_size,
      audienceSizeUpper: r.audience_size_upper_bound,
      path: r.path,
      topic: r.topic,
    }));
  }

  async getLead(ctx: MetaConnectorContext, leadId: string): Promise<MetaLeadInfo> {
    const data = await this.get<any>(ctx, `/${leadId}`, {
      fields: "id,form_id,ad_id,campaign_id,created_time,field_data",
    });
    return {
      leadId: data.id,
      formId: data.form_id,
      adId: data.ad_id,
      campaignId: data.campaign_id,
      createdTime: data.created_time,
      fieldData: (data.field_data ?? []).map((f: any) => ({ name: f.name, values: f.values ?? [] })),
    };
  }

  // ── internals ──

  private buildTargeting(spec: CreateAdSetSpec): Record<string, unknown> {
    const t = spec.targeting;
    const targeting: Record<string, unknown> = { geo_locations: t.geoLocations };
    if (t.ageMin) targeting.age_min = t.ageMin;
    if (t.ageMax) targeting.age_max = t.ageMax;
    if (t.genders?.length) targeting.genders = t.genders;
    if (t.locales?.length) targeting.locales = t.locales;
    if (t.interests?.length) targeting.flexible_spec = [{ interests: t.interests }];
    if (t.advantageAudience !== undefined) {
      targeting.targeting_automation = { advantage_audience: t.advantageAudience ? 1 : 0 };
    }
    return targeting;
  }

  private normalizeInsight(r: any, level: MetaInsightsQuery["level"]): MetaInsightsRow {
    const actions: { action_type: string; value: string }[] = r.actions ?? [];
    const leadAction = actions.find(
      (a) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped",
    );
    const purchaseAction = actions.find((a) => a.action_type === "purchase" || a.action_type === "offsite_conversion.fb_pixel_purchase");
    const actionValues: { action_type: string; value: string }[] = r.action_values ?? [];
    const purchaseValueEntry = actionValues.find((a) => a.action_type.includes("purchase"));
    const spend = Number(r.spend ?? 0);
    const leads = leadAction ? Number(leadAction.value) : 0;
    const conversions = purchaseAction ? Number(purchaseAction.value) : leads;
    const purchaseValue = purchaseValueEntry ? Number(purchaseValueEntry.value) : undefined;
    const roasEntry: { value: string }[] = r.purchase_roas ?? [];
    const entityId =
      level === "campaign" ? r.campaign_id : level === "adset" ? r.adset_id : level === "ad" ? r.ad_id : r.account_id ?? "account";
    return {
      dateStart: r.date_start,
      dateStop: r.date_stop,
      level,
      entityId,
      entityName: r.campaign_name ?? r.adset_name ?? r.ad_name,
      spend,
      impressions: Number(r.impressions ?? 0),
      reach: Number(r.reach ?? 0),
      clicks: Number(r.clicks ?? 0),
      ctr: r.ctr ? Number(r.ctr) : undefined,
      cpc: r.cpc ? Number(r.cpc) : undefined,
      cpm: r.cpm ? Number(r.cpm) : undefined,
      leads,
      conversions,
      purchaseValue,
      costPerLead: leads > 0 ? Number((spend / leads).toFixed(4)) : undefined,
      costPerConversion: conversions > 0 ? Number((spend / conversions).toFixed(4)) : undefined,
      roas: roasEntry[0] ? Number(roasEntry[0].value) : undefined,
      raw: r,
    };
  }

  private async get<T>(ctx: MetaConnectorContext, path: string, params: Record<string, string> = {}): Promise<T> {
    const q = new URLSearchParams({ ...params, access_token: ctx.accessToken });
    return this.raw<T>(`${this.base}${path}?${q.toString()}`);
  }

  private async post<T>(ctx: MetaConnectorContext, path: string, body: Record<string, unknown>): Promise<T> {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || v === null) continue;
      form.set(k, typeof v === "string" ? v : String(v));
    }
    form.set("access_token", ctx.accessToken);
    return this.raw<T>(`${this.base}${path}`, { method: "POST", body: form });
  }

  private async raw<T>(url: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, init);
    } catch (err) {
      throw new MetaApiError(`שגיאת רשת מול Meta: ${(err as Error).message}`, "TEMPORARY", undefined, undefined, undefined, true);
    }
    const text = await response.text();
    const json = text ? safeJson(text) : {};
    if (!response.ok) {
      throw mapGraphError(response.status, json);
    }
    return json as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
