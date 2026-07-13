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
  AdLibraryAd,
  AdLibraryQuery,
  CreateCustomAudienceSpec,
  MetaCustomAudienceInfo,
  MetaInsightsQuery,
  MetaInsightsRow,
  MetaInterest,
  MetaLeadInfo,
  MetaPageInfo,
  MetaPixelInfo,
  InterestSearchQuery,
  SplitTestSpec,
  SplitTestCellSpec,
  SplitTestInfo,
  SplitTestStatus,
} from "../types";

/** In-memory split-test store (module scope → survives connector re-instantiation). */
const MOCK_SPLIT_TESTS = new Map<string, { name: string; cells: SplitTestCellSpec[]; stopped: boolean }>();

interface MockEntity {
  id: string;
  status: string;
  [k: string]: unknown;
}

/** Deterministic hash → [0,1) from a string. No Math.random (keeps tests stable). */
function seed01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * In-memory Meta connector for local dev and tests. Seeds a plausible account and
 * lets create/activate calls mutate an internal store so the full publish flow
 * works end-to-end offline. Every create returns PAUSED, per the connector contract.
 */
export class MockMetaConnector implements MetaConnector {
  readonly kind = "mock" as const;

  // Per-instance store so parallel tenants don't collide in tests.
  private campaigns = new Map<string, MockEntity>();
  private adSets = new Map<string, MockEntity>();
  private ads = new Map<string, MockEntity>();
  private creatives = new Map<string, MockEntity>();
  private counter = 1000;

  constructor() {
    this.seed();
  }

  private nextId(prefix: string): string {
    this.counter += 1;
    return `mock_${prefix}_${this.counter}`;
  }

  private seed(): void {
    const c1: MockEntity = {
      id: "mock_campaign_1",
      status: "ACTIVE",
      name: "קמפיין לידים לדוגמה",
      objective: "OUTCOME_LEADS",
      dailyBudget: 15000,
    };
    this.campaigns.set(c1.id, c1);
    const c2: MockEntity = {
      id: "mock_campaign_2",
      status: "PAUSED",
      name: "קמפיין מכירות לדוגמה",
      objective: "OUTCOME_SALES",
      dailyBudget: 25000,
    };
    this.campaigns.set(c2.id, c2);
    const as1: MockEntity = {
      id: "mock_adset_1",
      status: "ACTIVE",
      campaignId: c1.id,
      name: "קהל רחב",
      optimizationGoal: "LEAD_GENERATION",
    };
    this.adSets.set(as1.id, as1);
    const ad1: MockEntity = {
      id: "mock_ad_1",
      status: "ACTIVE",
      adSetId: as1.id,
      campaignId: c1.id,
      name: "מודעה לדוגמה",
      creativeId: "mock_creative_1",
    };
    this.ads.set(ad1.id, ad1);
    this.creatives.set("mock_creative_1", {
      id: "mock_creative_1",
      status: "ACTIVE",
      name: "קריאייטיב לדוגמה",
      body: "טקסט מודעה לדוגמה",
      title: "כותרת",
    });
  }

  async getMe(): Promise<{ id: string; name: string }> {
    return { id: "mock_user_1", name: "משתמש דמו" };
  }

  async listAdAccounts(): Promise<MetaAdAccountInfo[]> {
    return [
      {
        accountId: "1234567890",
        name: "חשבון מודעות ראשי (דמו)",
        currency: "ILS",
        timezone: "Asia/Jerusalem",
        accountStatus: 1,
        minDailyBudgetCents: 500,
        business: { id: "mock_biz_1", name: "עסק דמו" },
      },
      {
        accountId: "9876543210",
        name: "חשבון מודעות משני (דמו)",
        currency: "ILS",
        timezone: "Asia/Jerusalem",
        accountStatus: 1,
        minDailyBudgetCents: 500,
      },
    ];
  }

  async listPages(): Promise<MetaPageInfo[]> {
    return [
      { pageId: "mock_page_1", name: "עמוד העסק (דמו)", category: "עסק מקומי", leadgenTosAccepted: true },
      { pageId: "mock_page_2", name: "עמוד משני (דמו)", category: "מותג", leadgenTosAccepted: false },
    ];
  }

  async listPixels(): Promise<MetaPixelInfo[]> {
    return [{ pixelId: "mock_pixel_1", name: "פיקסל ראשי (דמו)", adAccountId: "1234567890" }];
  }

  async listIgAccounts(): Promise<MetaIgAccountInfo[]> {
    return [{ igAccountId: "mock_ig_1", username: "demo_business" }];
  }

  async listCampaigns(): Promise<MetaCampaignInfo[]> {
    return [...this.campaigns.values()].map((c) => ({
      campaignId: c.id,
      name: c.name as string,
      objective: c.objective as string,
      status: c.status,
      effectiveStatus: c.status,
      dailyBudget: c.dailyBudget as number | undefined,
    }));
  }

  async listAdSets(_ctx: MetaConnectorContext, _acct: string, campaignId?: string): Promise<MetaAdSetInfo[]> {
    return [...this.adSets.values()]
      .filter((a) => !campaignId || a.campaignId === campaignId)
      .map((a) => ({
        adSetId: a.id,
        campaignId: a.campaignId as string,
        name: a.name as string,
        status: a.status,
        optimizationGoal: a.optimizationGoal as string | undefined,
      }));
  }

  async listAds(_ctx: MetaConnectorContext, _acct: string, adSetId?: string): Promise<MetaAdInfo[]> {
    return [...this.ads.values()]
      .filter((a) => !adSetId || a.adSetId === adSetId)
      .map((a) => ({
        adId: a.id,
        adSetId: a.adSetId as string,
        campaignId: a.campaignId as string,
        name: a.name as string,
        status: a.status,
        creativeId: a.creativeId as string | undefined,
      }));
  }

  async listCreatives(): Promise<MetaCreativeInfo[]> {
    return [...this.creatives.values()].map((c) => ({
      creativeId: c.id,
      name: c.name as string,
      body: c.body as string | undefined,
      title: c.title as string | undefined,
    }));
  }

  async getInsights(
    _ctx: MetaConnectorContext,
    adAccountId: string,
    query: MetaInsightsQuery,
  ): Promise<MetaInsightsRow[]> {
    const days = daysForPreset(query.datePreset, query.since, query.until);
    const entityIds = query.entityIds?.length ? query.entityIds : [adAccountId];
    const rows: MetaInsightsRow[] = [];
    for (const entityId of entityIds) {
      for (let i = 0; i < days; i++) {
        const date = isoDaysAgo(days - i);
        const r = seed01(`${entityId}-${date}`);
        const spend = 100 + Math.round(r * 120);
        const impressions = 4000 + Math.round(r * 6000);
        const clicks = 60 + Math.round(r * 120);
        const leads = 1 + Math.round(r * 6);
        rows.push({
          dateStart: date,
          dateStop: date,
          level: query.level,
          entityId,
          spend,
          impressions,
          reach: Math.round(impressions * 0.82),
          clicks,
          ctr: Number(((clicks / impressions) * 100).toFixed(4)),
          cpc: Number((spend / clicks).toFixed(4)),
          cpm: Number(((spend / impressions) * 1000).toFixed(4)),
          leads,
          conversions: leads,
          costPerLead: Number((spend / leads).toFixed(4)),
          costPerConversion: Number((spend / leads).toFixed(4)),
        });
      }
    }
    return rows;
  }

  async createCampaign(_ctx: MetaConnectorContext, _acct: string, spec: CreateCampaignSpec): Promise<CreatedEntity> {
    const id = this.nextId("campaign");
    this.campaigns.set(id, { id, status: "PAUSED", name: spec.name, objective: spec.objective });
    return { id, status: "PAUSED" };
  }

  async createAdSet(_ctx: MetaConnectorContext, _acct: string, spec: CreateAdSetSpec): Promise<CreatedEntity> {
    const id = this.nextId("adset");
    this.adSets.set(id, {
      id,
      status: "PAUSED",
      campaignId: spec.campaignId,
      name: spec.name,
      optimizationGoal: spec.optimizationGoal,
    });
    return { id, status: "PAUSED" };
  }

  async createCreative(_ctx: MetaConnectorContext, _acct: string, spec: CreateCreativeSpec): Promise<CreatedEntity> {
    const id = this.nextId("creative");
    this.creatives.set(id, { id, status: "PAUSED", name: spec.name, body: spec.message, title: spec.headline });
    return { id, status: "PAUSED" };
  }

  async createAd(_ctx: MetaConnectorContext, _acct: string, spec: CreateAdSpec): Promise<CreatedEntity> {
    const id = this.nextId("ad");
    this.ads.set(id, { id, status: "PAUSED", adSetId: spec.adSetId, name: spec.name, creativeId: spec.creativeId });
    return { id, status: "PAUSED" };
  }

  async activateEntity(_ctx: MetaConnectorContext, _acct: string, type: MetaEntityType, id: string): Promise<void> {
    this.store(type).get(id) && (this.store(type).get(id)!.status = "ACTIVE");
  }

  async pauseEntity(_ctx: MetaConnectorContext, _acct: string, type: MetaEntityType, id: string): Promise<void> {
    this.store(type).get(id) && (this.store(type).get(id)!.status = "PAUSED");
  }

  async updateEntity(
    _ctx: MetaConnectorContext,
    _acct: string,
    type: MetaEntityType,
    id: string,
    fields: { dailyBudget?: number; lifetimeBudget?: number },
  ): Promise<void> {
    const entity = this.store(type).get(id);
    if (!entity) return;
    if (fields.dailyBudget !== undefined) entity.dailyBudget = fields.dailyBudget;
    if (fields.lifetimeBudget !== undefined) entity.lifetimeBudget = fields.lifetimeBudget;
  }

  private audiences = new Map<string, MockEntity>();

  async listCustomAudiences(): Promise<MetaCustomAudienceInfo[]> {
    if (this.audiences.size === 0) {
      // seed one so the UI isn't empty on first load
      this.audiences.set("mock_aud_seed", {
        id: "mock_aud_seed",
        status: "READY",
        name: "מבקרי אתר 30 יום (דמו)",
        subtype: "WEBSITE",
        approximate_count: 4200,
      });
    }
    return [...this.audiences.values()].map((a) => ({
      audienceId: a.id,
      name: a.name as string,
      subtype: a.subtype as MetaCustomAudienceInfo["subtype"],
      approximateCount: a.approximate_count as number | undefined,
      originAudienceId: a.origin_audience_id as string | undefined,
      ratio: a.ratio as number | undefined,
    }));
  }

  async createCustomAudience(
    _ctx: MetaConnectorContext,
    _acct: string,
    spec: CreateCustomAudienceSpec,
  ): Promise<{ id: string }> {
    const id = this.nextId("aud");
    this.audiences.set(id, {
      id,
      status: "READY",
      name: spec.name,
      subtype: spec.subtype,
      approximate_count: spec.subtype === "LOOKALIKE" ? 200000 : 3500,
      origin_audience_id: spec.originAudienceId,
      ratio: spec.ratio,
    });
    return { id };
  }

  async deleteCustomAudience(_ctx: MetaConnectorContext, audienceId: string): Promise<void> {
    this.audiences.delete(audienceId);
  }

  async searchAdLibrary(_ctx: MetaConnectorContext, query: AdLibraryQuery): Promise<AdLibraryAd[]> {
    const term = query.searchTerms ?? "עסק";
    const competitors = ["המתחרה המוביל", "רשת ארצית", "מכון פרימיום", "שירות מקומי"];
    return competitors.map((name, i) => {
      const r = seed01(`${term}-${i}`);
      return {
        pageId: `mock_comp_${i}`,
        pageName: name,
        adCreativeBodies: [
          i % 2 === 0
            ? `${term} במחיר הטוב ביותר! הצטרפו עכשיו וקבלו הנחה מיוחדת. מקומות מוגבלים.`
            : `למה לבחור בנו? ${Math.round(r * 500 + 100)} לקוחות מרוצים, שירות אישי, תוצאות מוכחות.`,
        ],
        adCreativeTitles: [i % 2 === 0 ? "מבצע השקה" : "המומחים שלך"],
        adSnapshotUrl: `https://facebook.com/ads/library/?id=mock_${i}`,
        publisherPlatforms: ["facebook", "instagram"],
        createdTime: isoDaysAgo(Math.round(r * 30)),
      };
    });
  }

  async searchInterests(_ctx: MetaConnectorContext, query: InterestSearchQuery): Promise<MetaInterest[]> {
    const q = (query.q ?? "").trim();
    // A small Israeli-market detailed-targeting catalog. Real connectors hit
    // Graph /search?type=adinterest; the mock filters this catalog by substring.
    const catalog: { name: string; type: MetaInterest["type"]; topic: string; syn: string[] }[] = [
      { name: "רפואת שיניים", type: "interests", topic: "בריאות", syn: ["שיניים", "יישור", "השתלות", "dentist"] },
      { name: "כושר ואימונים", type: "interests", topic: "ספורט", syn: ["כושר", "חדר כושר", "פיטנס", "fitness", "אימון"] },
      { name: "יזמות עסקית", type: "interests", topic: "עסקים", syn: ["עסק", "יזם", "סטארטאפ", "business", "עצמאי"] },
      { name: "נדל\"ן", type: "interests", topic: "נדל\"ן", syn: ["דירה", "השקעה", "נדלן", "real estate", "מגורים"] },
      { name: "יופי וטיפוח", type: "interests", topic: "אופנה ויופי", syn: ["יופי", "קוסמטיקה", "אסתטיקה", "beauty", "טיפוח"] },
      { name: "הורים לילדים קטנים", type: "demographics", topic: "משפחה", syn: ["הורים", "תינוק", "ילדים", "parents", "אמהות"] },
      { name: "מנהלי שיווק", type: "work_positions", topic: "עבודה", syn: ["שיווק", "מנהל", "marketing", "דיגיטל"] },
      { name: "קונים אונליין (התנהגות)", type: "behaviors", topic: "התנהגות רכישה", syn: ["קניות", "אונליין", "רכישה", "online", "צרכנים"] },
      { name: "תיירות ונופש", type: "interests", topic: "פנאי", syn: ["טיול", "חופשה", "תיירות", "travel", "מלון"] },
      { name: "מזון ומסעדות", type: "interests", topic: "אוכל", syn: ["מסעדה", "אוכל", "שף", "food", "משלוחים"] },
    ];
    const matches = q
      ? catalog.filter(
          (c) => c.name.includes(q) || c.topic.includes(q) || c.syn.some((s) => s.includes(q) || q.includes(s)),
        )
      : catalog;
    const pool = matches.length ? matches : catalog;
    const limit = Math.min(query.limit ?? 12, pool.length);
    return pool.slice(0, limit).map((c, i) => {
      const r = seed01(`${q}-${c.name}-${i}`);
      const lower = Math.round(50_000 + r * 900_000);
      return {
        id: `mock_int_${Math.round(seed01(c.name) * 1e9)}`,
        name: c.name,
        type: c.type,
        audienceSizeLower: lower,
        audienceSizeUpper: Math.round(lower * (1.4 + r)),
        path: [c.topic, c.name],
        topic: c.topic,
      };
    });
  }

  async createSplitTest(
    _ctx: MetaConnectorContext,
    _adAccountId: string,
    spec: SplitTestSpec,
  ): Promise<{ id: string; status: SplitTestStatus }> {
    const id = `mock_study_${Math.round(seed01(spec.name + spec.cells.map((c) => c.metaEntityId).join()) * 1e9)}`;
    // Persist so getSplitTest can faithfully echo the cells' entity ids (the real
    // API ties each cell to the ad entity it tests). Module-scoped to survive
    // across connector instances within the process.
    MOCK_SPLIT_TESTS.set(id, { name: spec.name, cells: spec.cells, stopped: false });
    return { id, status: "RUNNING" };
  }

  async getSplitTest(_ctx: MetaConnectorContext, testId: string): Promise<SplitTestInfo> {
    const stored = MOCK_SPLIT_TESTS.get(testId);
    // Faithful path: cells reflect the entities that were launched, each with its
    // own deterministic (entity-seeded) metrics — so results attribute correctly.
    const specCells = stored?.cells ?? [
      { name: "וריאציה A", metaEntityId: `${testId}_A` },
      { name: "וריאציה B", metaEntityId: `${testId}_B` },
    ];
    const cells = specCells.map((c, i) => {
      const r = seed01(c.metaEntityId + testId);
      const impressions = 8000 + Math.round(r * 4000);
      const ctr = 0.026 + r * 0.01;
      const clicks = Math.round(impressions * ctr);
      const cvr = 0.04 + seed01(c.metaEntityId + "cvr") * 0.06;
      return {
        id: `${testId}_cell_${i}`,
        name: c.name,
        metaEntityId: c.metaEntityId,
        impressions,
        clicks,
        conversions: Math.round(clicks * cvr),
      };
    });
    return {
      id: testId,
      name: stored?.name ?? "מבחן פיצול",
      status: stored?.stopped ? "CANCELLED" : "RUNNING",
      cells,
      startTime: isoDaysAgo(7),
    };
  }

  async stopSplitTest(_ctx: MetaConnectorContext, _adAccountId: string, testId: string): Promise<void> {
    const stored = MOCK_SPLIT_TESTS.get(testId);
    if (stored) stored.stopped = true;
  }

  async getLead(_ctx: MetaConnectorContext, leadId: string): Promise<MetaLeadInfo> {
    const r = seed01(leadId);
    const first = ["דנה", "אבי", "נועה", "יוסי", "מיכל"][Math.floor(r * 5)];
    return {
      leadId,
      formId: "mock_form_1",
      adId: "mock_ad_1",
      campaignId: "mock_campaign_1",
      createdTime: isoDaysAgo(0),
      fieldData: [
        { name: "full_name", values: [`${first} ישראלי`] },
        { name: "email", values: [`${first.toLowerCase()}${Math.floor(r * 1000)}@example.co.il`] },
        { name: "phone_number", values: [`05${Math.floor(r * 90000000 + 10000000)}`] },
      ],
    };
  }

  private store(type: MetaEntityType): Map<string, MockEntity> {
    return type === "campaign" ? this.campaigns : type === "ad_set" ? this.adSets : this.ads;
  }
}

function daysForPreset(preset?: string, since?: string, until?: string): number {
  if (since && until) {
    const d = Math.round((Date.parse(until) - Date.parse(since)) / 86_400_000) + 1;
    return Math.min(Math.max(d, 1), 90);
  }
  switch (preset) {
    case "today":
    case "yesterday":
      return 1;
    case "last_7d":
      return 7;
    case "last_14d":
      return 14;
    case "last_28d":
      return 28;
    case "last_90d":
      return 90;
    default:
      return 30;
  }
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
