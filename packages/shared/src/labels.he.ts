// Hebrew UI vocabulary — single source of truth for status/enum labels.

import type {
  AgentType,
  ApprovalAction,
  ApprovalStatus,
  CampaignGoal,
  CampaignStatus,
  ClientStatus,
  CopyKind,
  EntityPublishStatus,
  MetaConnectionStatus,
  OrgRole,
  RecommendationSeverity,
  RecommendationStatus,
  RecommendationType,
  VariantStyle,
} from "./enums";

export const ROLE_LABELS_HE: Record<OrgRole, string> = {
  ADMIN: "מנהל מערכת",
  AGENCY_OWNER: "בעל סוכנות",
  ACCOUNT_MANAGER: "מנהל תיקי לקוחות",
  CLIENT_VIEWER: "צפייה בלבד (לקוח)",
};

export const CAMPAIGN_GOAL_LABELS_HE: Record<CampaignGoal, string> = {
  LEADS: "לידים",
  SALES: "מכירות",
  TRAFFIC: "תנועה לאתר",
  MESSAGES: "הודעות",
  AWARENESS: "מודעות למותג",
  ENGAGEMENT: "מעורבות",
  REMARKETING: "רימרקטינג",
};

export const CLIENT_STATUS_LABELS_HE: Record<ClientStatus, string> = {
  ONBOARDING: "בתהליך הקמה",
  ACTIVE: "פעיל",
  PAUSED: "מושהה",
  ARCHIVED: "בארכיון",
};

export const CAMPAIGN_STATUS_LABELS_HE: Record<CampaignStatus, string> = {
  DRAFT: "טיוטה",
  PENDING_APPROVAL: "ממתין לאישור",
  APPROVED: "מאושר",
  PUBLISHING: "בתהליך פרסום",
  PUBLISHED: "מפורסם",
  PAUSED: "מושהה",
  ARCHIVED: "בארכיון",
  ERROR: "שגיאה",
};

export const ENTITY_PUBLISH_STATUS_LABELS_HE: Record<EntityPublishStatus, string> =
  CAMPAIGN_STATUS_LABELS_HE;

export const META_CONNECTION_STATUS_LABELS_HE: Record<MetaConnectionStatus, string> = {
  CONNECTED: "מחובר",
  NEEDS_RECONNECT: "דורש חידוש חיבור",
  ERROR: "שגיאה בחיבור",
  DISCONNECTED: "לא מחובר",
};

export const APPROVAL_STATUS_LABELS_HE: Record<ApprovalStatus, string> = {
  PENDING: "ממתין לאישור",
  APPROVED: "אושר",
  REJECTED: "נדחה",
  EXPIRED: "פג תוקף",
  CONSUMED: "בוצע",
};

export const APPROVAL_ACTION_LABELS_HE: Record<ApprovalAction, string> = {
  PUBLISH: "פרסום",
  UPDATE: "עדכון",
  PAUSE: "השהיה",
  RESUME: "הפעלה מחדש",
  DELETE: "מחיקה",
  BUDGET_INCREASE: "הגדלת תקציב",
  BUDGET_DECREASE: "הקטנת תקציב",
};

export const VARIANT_STYLE_LABELS_HE: Record<VariantStyle, string> = {
  SHORT: "קופי קצר",
  LONG: "קופי ארוך",
  EMOTIONAL: "רגשי",
  DIRECT: "ישיר",
  PROOF: "מבוסס הוכחה",
  PAIN: "מבוסס כאב",
  DREAM: "מבוסס חלום/תוצאה",
};

export const COPY_KIND_LABELS_HE: Record<CopyKind, string> = {
  ANGLE: "זווית",
  HOOK: "הוק",
  PRIMARY_TEXT: "טקסט ראשי",
  HEADLINE: "כותרת",
  DESCRIPTION: "תיאור",
  CTA: "קריאה לפעולה",
  IMAGE_IDEA: "רעיון לתמונה",
  VIDEO_IDEA: "רעיון לוידאו",
};

export const AGENT_TYPE_LABELS_HE: Record<AgentType, string> = {
  RESEARCH: "סוכן מחקר",
  PERSONA: "סוכן פרסונות",
  STRATEGY: "סוכן אסטרטגיה",
  COPY: "סוכן קופי",
  CREATIVE: "סוכן קריאייטיב",
  META_API: "סוכן Meta API",
  ANALYTICS: "סוכן אנליטיקה",
  OPTIMIZATION: "סוכן אופטימיזציה",
  COMPLIANCE: "סוכן תאימות",
  APPROVAL: "סוכן אישורים",
};

export const RECOMMENDATION_TYPE_LABELS_HE: Record<RecommendationType, string> = {
  KILL_AD: "כיבוי מודעה",
  SCALE_BUDGET: "הגדלת תקציב",
  REDUCE_BUDGET: "הקטנת תקציב",
  NEW_VARIANT: "וריאציה חדשה",
  REFRESH_CREATIVE: "רענון קריאייטיב",
  AUDIENCE_CHANGE: "שינוי קהל",
  STRUCTURE_CHANGE: "שינוי מבנה קמפיין",
  ALERT: "התראה",
};

export const RECOMMENDATION_SEVERITY_LABELS_HE: Record<RecommendationSeverity, string> = {
  INFO: "מידע",
  SUGGESTION: "המלצה",
  WARNING: "אזהרה",
  CRITICAL: "קריטי",
};

export const RECOMMENDATION_STATUS_LABELS_HE: Record<RecommendationStatus, string> = {
  NEW: "חדש",
  ACKNOWLEDGED: "נצפה",
  APPLIED: "יושם",
  DISMISSED: "נדחה",
};

export const BRAND_TONES_HE: { value: string; label: string }[] = [
  { value: "luxury", label: "יוקרתי" },
  { value: "direct", label: "ישיר" },
  { value: "casual", label: "עממי" },
  { value: "professional", label: "מקצועי" },
  { value: "funny", label: "מצחיק" },
  { value: "emotional", label: "רגשי" },
  { value: "aggressive", label: "אגרסיבי" },
  { value: "gentle", label: "עדין" },
];
