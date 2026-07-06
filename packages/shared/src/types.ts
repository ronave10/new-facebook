// Cross-cutting API types shared between apps/api and apps/web.

import type {
  AgentType,
  ApprovalAction,
  ApprovalEntityType,
  ApprovalStatus,
  BudgetType,
  CampaignGoal,
  CampaignStatus,
  CopyKind,
  MetaConnectionStatus,
  OrgRole,
  RecommendationSeverity,
  RecommendationStatus,
  RecommendationType,
  VariantStyle,
} from "./enums";

export interface ApiError {
  statusCode: number;
  message: string;
  /** Stable machine code, e.g. "META_TOKEN_EXPIRED" */
  code?: string;
  details?: unknown;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  locale: string;
}

export interface AuthSession {
  user: AuthUser;
  organizationId: string;
  organizationName: string;
  role: OrgRole;
  accessToken: string;
  refreshToken: string;
}

export interface ClientSummary {
  id: string;
  name: string;
  industry: string | null;
  status: string;
  website: string | null;
  currency: string;
  country: string;
  metaConnected: boolean;
  campaignCount: number;
  createdAt: string;
}

export interface BrandProfilePayload {
  campaignGoal?: CampaignGoal;
  mainProduct?: string;
  priceRange?: string;
  keyBenefits?: string[];
  differentiation?: string;
  customerPains?: string[];
  commonObjections?: string[];
  proofs?: { type: string; description: string }[];
  brandTone?: string;
  restrictions?: {
    forbiddenWords?: string[];
    forbiddenPromises?: string[];
    regulatoryNotes?: string;
    sensitiveTopics?: string[];
  };
}

export interface PersonaPayload {
  name: string;
  ageRange?: string;
  lifeSituation?: string;
  pains: string[];
  desires: string[];
  fears: string[];
  objections: string[];
  emotionalTriggers: string[];
  conversionDrivers: string[];
  distrustTriggers: string[];
  copyStyle?: string;
  creativeStyle?: string;
  matchingOffers: string[];
  campaignAngles: string[];
}

export interface GeneratedAdVariant {
  personaId?: string;
  personaName?: string;
  angle: string;
  hook: string;
  primaryText: string;
  headline: string;
  description: string;
  cta: string;
  creativeBrief: {
    concept: string;
    visualDirection: string;
    textOnImage?: string;
    format: "IMAGE" | "VIDEO" | "CAROUSEL";
  };
  complianceNotes: string;
  confidenceScore: number;
  whyItWorks: string;
  variantStyle: VariantStyle;
}

export interface AdGenerationResult {
  angles: string[];
  hooks: string[];
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
  ctas: string[];
  imageIdeas: string[];
  videoIdeas: string[];
  adVariants: GeneratedAdVariant[];
}

export interface StrategyResult {
  summary: string;
  structure: {
    campaigns: { name: string; goal: CampaignGoal; budgetSharePct: number; funnelStage: "TOF" | "MOF" | "BOF" }[];
  };
  budgetSplit: { name: string; sharePct: number; rationale: string }[];
  abTestPlan: { hypothesis: string; variable: string; variants: string[]; minSpend: number; kpi: string }[];
  kpis: { name: string; target: string; stage: string }[];
  rules: {
    killRules: string[];
    scaleRules: string[];
    refreshRules: string[];
  };
}

export interface ApprovalSummary {
  id: string;
  entityType: ApprovalEntityType;
  entityId: string;
  entityName?: string;
  action: ApprovalAction;
  status: ApprovalStatus;
  payloadPreview: unknown;
  requestedByName?: string;
  createdAt: string;
}

export interface MetaConnectionSummary {
  id: string;
  status: MetaConnectionStatus;
  metaUserName: string | null;
  scopes: string[];
  tokenExpiresAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  adAccounts: {
    id: string;
    accountId: string;
    name: string;
    currency: string | null;
    isSelected: boolean;
  }[];
  pages: { id: string; pageId: string; name: string; leadgenTosAccepted: boolean }[];
  pixels: { id: string; pixelId: string; name: string | null }[];
}

export interface DashboardOverview {
  totalSpend: number;
  totalLeads: number;
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number | null;
  avgCpc: number | null;
  avgCpl: number | null;
  currency: string;
  activeCampaigns: number;
  pendingApprovals: number;
  bestCampaigns: { id: string; name: string; metric: string; value: number }[];
  worstCampaigns: { id: string; name: string; metric: string; value: number }[];
  alerts: { severity: RecommendationSeverity; title: string; entityId?: string }[];
  actionList: { title: string; recommendationId?: string }[];
}

export interface RecommendationSummary {
  id: string;
  type: RecommendationType;
  severity: RecommendationSeverity;
  status: RecommendationStatus;
  title: string;
  body: string;
  evidence: unknown;
  createdAt: string;
}

export interface AgentRunSummary {
  id: string;
  agentType: AgentType;
  status: string;
  model: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface CampaignSummary {
  id: string;
  name: string;
  goal: CampaignGoal;
  status: CampaignStatus;
  budgetType: BudgetType;
  budgetAmount: number | null;
  currency: string;
  metaCampaignId: string | null;
  clientId: string;
  clientName?: string;
  adSetCount: number;
  adCount: number;
  createdAt: string;
}

export interface CopyVariantSummary {
  id: string;
  kind: CopyKind;
  content: string;
  variantStyle: VariantStyle | null;
  score: number | null;
  selected: boolean;
}
