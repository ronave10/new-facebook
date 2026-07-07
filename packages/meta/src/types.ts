// Wire-level types for the Meta integration layer.
// These mirror Marketing API shapes (Graph API v23.0) but are our own contract —
// every connector (mock / marketing-api / mcp) must normalize to these.

export interface MetaAdAccountInfo {
  accountId: string; // numeric, without "act_"
  name: string;
  currency: string;
  timezone: string;
  accountStatus: number; // 1 ACTIVE, 2 DISABLED, 3 UNSETTLED, ...
  minDailyBudgetCents?: number;
  business?: { id: string; name: string };
}

export interface MetaPageInfo {
  pageId: string;
  name: string;
  category?: string;
  leadgenTosAccepted?: boolean;
}

export interface MetaPixelInfo {
  pixelId: string;
  name?: string;
  adAccountId?: string;
}

export interface MetaIgAccountInfo {
  igAccountId: string;
  username: string;
}

export interface MetaCampaignInfo {
  campaignId: string;
  name: string;
  objective: string;
  status: string; // ACTIVE | PAUSED | DELETED | ARCHIVED
  effectiveStatus?: string;
  dailyBudget?: number; // minor units
  lifetimeBudget?: number;
  startTime?: string;
  stopTime?: string;
  specialAdCategories?: string[];
  createdTime?: string;
}

export interface MetaAdSetInfo {
  adSetId: string;
  campaignId: string;
  name: string;
  status: string;
  optimizationGoal?: string;
  billingEvent?: string;
  dailyBudget?: number;
  lifetimeBudget?: number;
  targeting?: unknown;
  startTime?: string;
  endTime?: string;
}

export interface MetaAdInfo {
  adId: string;
  adSetId: string;
  campaignId: string;
  name: string;
  status: string;
  creativeId?: string;
}

export interface MetaCreativeInfo {
  creativeId: string;
  name?: string;
  body?: string;
  title?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  callToActionType?: string;
  objectType?: string;
}

export interface MetaInsightsRow {
  dateStart: string;
  dateStop: string;
  level: "account" | "campaign" | "adset" | "ad";
  entityId: string;
  entityName?: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  leads?: number;
  conversions?: number;
  purchaseValue?: number;
  costPerLead?: number;
  costPerConversion?: number;
  roas?: number;
  raw?: unknown;
}

export interface MetaInsightsQuery {
  level: "account" | "campaign" | "adset" | "ad";
  datePreset?: string; // e.g. "last_30d"
  since?: string; // YYYY-MM-DD
  until?: string;
  timeIncrement?: 1 | 7 | 28 | "monthly" | "all_days";
  entityIds?: string[];
}

export interface CreateCampaignSpec {
  name: string;
  objective: string; // OUTCOME_*
  specialAdCategories: string[];
  dailyBudget?: number; // minor units — CBO
  lifetimeBudget?: number;
  startTime?: string;
  stopTime?: string;
}

export interface CreateAdSetSpec {
  campaignId: string;
  name: string;
  optimizationGoal: string;
  billingEvent: string;
  dailyBudget?: number; // only if parent campaign is not CBO
  lifetimeBudget?: number;
  startTime?: string;
  endTime?: string;
  targeting: {
    geoLocations: { countries?: string[]; cities?: { key: string }[] };
    ageMin?: number;
    ageMax?: number;
    genders?: number[];
    locales?: number[];
    interests?: { id: string; name?: string }[];
    advantageAudience?: boolean;
  };
  destinationType?: string;
  promotedObject?: { pixelId?: string; pageId?: string; customEventType?: string };
  dsaBeneficiary?: string;
  dsaPayor?: string;
}

export interface CreateCreativeSpec {
  name: string;
  pageId: string;
  instagramUserId?: string;
  linkUrl?: string;
  message?: string; // primary text
  headline?: string;
  description?: string;
  callToActionType?: string;
  imageUrl?: string;
  imageHash?: string;
  videoId?: string;
}

export interface CreateAdSpec {
  adSetId: string;
  name: string;
  creativeId: string;
}

export interface CreatedEntity {
  id: string;
  status: "PAUSED"; // connectors MUST always create entities paused
}

export interface MetaLeadInfo {
  leadId: string;
  formId?: string;
  adId?: string;
  campaignId?: string;
  createdTime?: string;
  /** Raw field_data from the Lead Ad form: [{ name, values }]. */
  fieldData: { name: string; values: string[] }[];
}

export interface AdLibraryAd {
  pageId: string;
  pageName: string;
  adCreativeBodies: string[];
  adCreativeTitles: string[];
  adSnapshotUrl?: string;
  publisherPlatforms?: string[];
  createdTime?: string;
}

export interface AdLibraryQuery {
  searchTerms?: string;
  pageIds?: string[];
  countries?: string[];
  limit?: number;
}

/** A Meta detailed-targeting item (interest / behavior / demographic). */
export interface MetaInterest {
  id: string;
  name: string;
  type: "interests" | "behaviors" | "demographics" | "work_positions" | "industries";
  /** Approximate reachable audience size (lower/upper bound). */
  audienceSizeLower?: number;
  audienceSizeUpper?: number;
  /** Disambiguation path, e.g. ["Business", "Marketing"]. */
  path?: string[];
  topic?: string;
}

export interface InterestSearchQuery {
  q: string;
  limit?: number;
}

export type CustomAudienceSubtype = "WEBSITE" | "ENGAGEMENT" | "CUSTOM" | "LOOKALIKE";

export interface MetaCustomAudienceInfo {
  audienceId: string;
  name: string;
  subtype: CustomAudienceSubtype;
  description?: string;
  approximateCount?: number;
  originAudienceId?: string;
  ratio?: number;
}

export interface CreateCustomAudienceSpec {
  name: string;
  subtype: CustomAudienceSubtype;
  description?: string;
  /** WEBSITE: pixel id + retention days. */
  pixelId?: string;
  retentionDays?: number;
  /** ENGAGEMENT: page id (page engagers). */
  pageId?: string;
  /** LOOKALIKE: origin audience + ratio (0.01–0.20) + country. */
  originAudienceId?: string;
  ratio?: number;
  country?: string;
}

export type MetaEntityType = "campaign" | "ad_set" | "ad";

/** Structured error every connector must throw. */
export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly code: MetaErrorCode,
    public readonly graphCode?: number,
    public readonly graphSubcode?: number,
    public readonly httpStatus?: number,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

export type MetaErrorCode =
  | "TOKEN_EXPIRED" // graph 190 → mark connection NEEDS_RECONNECT
  | "PERMISSION_DENIED" // graph 200/10/294
  | "RATE_LIMITED" // graph 4/17/613 → retry with backoff
  | "INVALID_PARAMETER" // graph 100
  | "BUDGET_TOO_LOW"
  | "POLICY_VIOLATION"
  | "NOT_FOUND"
  | "TEMPORARY" // graph 1/2 transient
  | "UNKNOWN";

/** Hebrew user-facing messages per error code. */
export const META_ERROR_MESSAGES_HE: Record<MetaErrorCode, string> = {
  TOKEN_EXPIRED: "החיבור ל־Meta פג תוקף. יש להתחבר מחדש.",
  PERMISSION_DENIED: "אין הרשאה מתאימה בחשבון Meta. בדקו את הרשאות המשתמש והחשבון.",
  RATE_LIMITED: "Meta הגבילה זמנית את קצב הבקשות. ננסה שוב אוטומטית בעוד מספר דקות.",
  INVALID_PARAMETER: "אחד מהשדות שנשלחו ל־Meta אינו תקין. בדקו את הגדרות הקמפיין.",
  BUDGET_TOO_LOW: "התקציב שהוגדר נמוך מהמינימום המותר בחשבון המודעות.",
  POLICY_VIOLATION: "המודעה נדחתה עקב הפרת מדיניות פרסום של Meta.",
  NOT_FOUND: "הישות המבוקשת לא נמצאה בחשבון Meta.",
  TEMPORARY: "שגיאה זמנית מול Meta. נסו שוב בעוד רגע.",
  UNKNOWN: "אירעה שגיאה לא צפויה מול Meta.",
};
