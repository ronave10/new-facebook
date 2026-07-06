// String-literal mirrors of Prisma enums, safe for frontend use (no Prisma import).

export const ORG_ROLES = ["ADMIN", "AGENCY_OWNER", "ACCOUNT_MANAGER", "CLIENT_VIEWER"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const CAMPAIGN_GOALS = [
  "LEADS",
  "SALES",
  "TRAFFIC",
  "MESSAGES",
  "AWARENESS",
  "ENGAGEMENT",
  "REMARKETING",
] as const;
export type CampaignGoal = (typeof CAMPAIGN_GOALS)[number];

export const CLIENT_STATUSES = ["ONBOARDING", "ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CAMPAIGN_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "PUBLISHING",
  "PUBLISHED",
  "PAUSED",
  "ARCHIVED",
  "ERROR",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const META_CONNECTION_STATUSES = [
  "CONNECTED",
  "NEEDS_RECONNECT",
  "ERROR",
  "DISCONNECTED",
] as const;
export type MetaConnectionStatus = (typeof META_CONNECTION_STATUSES)[number];

export const BUDGET_TYPES = ["DAILY", "LIFETIME"] as const;
export type BudgetType = (typeof BUDGET_TYPES)[number];

export const VARIANT_STYLES = ["SHORT", "LONG", "EMOTIONAL", "DIRECT", "PROOF", "PAIN", "DREAM"] as const;
export type VariantStyle = (typeof VARIANT_STYLES)[number];

export const COPY_KINDS = [
  "ANGLE",
  "HOOK",
  "PRIMARY_TEXT",
  "HEADLINE",
  "DESCRIPTION",
  "CTA",
  "IMAGE_IDEA",
  "VIDEO_IDEA",
] as const;
export type CopyKind = (typeof COPY_KINDS)[number];

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REJECTED", "EXPIRED", "CONSUMED"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_ACTIONS = [
  "PUBLISH",
  "UPDATE",
  "PAUSE",
  "RESUME",
  "DELETE",
  "BUDGET_INCREASE",
  "BUDGET_DECREASE",
] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export const APPROVAL_ENTITY_TYPES = [
  "CAMPAIGN",
  "AD_SET",
  "AD",
  "BUDGET_CHANGE",
  "STATUS_CHANGE",
  "CONNECTION",
] as const;
export type ApprovalEntityType = (typeof APPROVAL_ENTITY_TYPES)[number];

export const AGENT_TYPES = [
  "RESEARCH",
  "PERSONA",
  "STRATEGY",
  "COPY",
  "CREATIVE",
  "META_API",
  "ANALYTICS",
  "OPTIMIZATION",
  "COMPLIANCE",
  "APPROVAL",
] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export const RECOMMENDATION_TYPES = [
  "KILL_AD",
  "SCALE_BUDGET",
  "REDUCE_BUDGET",
  "NEW_VARIANT",
  "REFRESH_CREATIVE",
  "AUDIENCE_CHANGE",
  "STRUCTURE_CHANGE",
  "ALERT",
] as const;
export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

export const RECOMMENDATION_SEVERITIES = ["INFO", "SUGGESTION", "WARNING", "CRITICAL"] as const;
export type RecommendationSeverity = (typeof RECOMMENDATION_SEVERITIES)[number];

export const RECOMMENDATION_STATUSES = ["NEW", "ACKNOWLEDGED", "APPLIED", "DISMISSED"] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export const ENTITY_PUBLISH_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "PUBLISHING",
  "PUBLISHED",
  "PAUSED",
  "ARCHIVED",
  "ERROR",
] as const;
export type EntityPublishStatus = (typeof ENTITY_PUBLISH_STATUSES)[number];

export const CREATIVE_TYPES = ["IMAGE", "VIDEO", "CAROUSEL"] as const;
export type CreativeType = (typeof CREATIVE_TYPES)[number];

/** Maps our business goal to the Meta Marketing API ODAX objective. */
export const GOAL_TO_META_OBJECTIVE: Record<CampaignGoal, string> = {
  LEADS: "OUTCOME_LEADS",
  SALES: "OUTCOME_SALES",
  TRAFFIC: "OUTCOME_TRAFFIC",
  MESSAGES: "OUTCOME_ENGAGEMENT",
  AWARENESS: "OUTCOME_AWARENESS",
  ENGAGEMENT: "OUTCOME_ENGAGEMENT",
  REMARKETING: "OUTCOME_SALES",
};

/** Default optimization goal per business goal (validated against Meta's matrix). */
export const GOAL_TO_OPTIMIZATION_GOAL: Record<CampaignGoal, string> = {
  LEADS: "LEAD_GENERATION",
  SALES: "OFFSITE_CONVERSIONS",
  TRAFFIC: "LANDING_PAGE_VIEWS",
  MESSAGES: "CONVERSATIONS",
  AWARENESS: "REACH",
  ENGAGEMENT: "POST_ENGAGEMENT",
  REMARKETING: "OFFSITE_CONVERSIONS",
};
