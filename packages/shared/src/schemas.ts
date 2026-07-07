import { z } from "zod";
import {
  BUDGET_TYPES,
  CAMPAIGN_GOALS,
  ORG_ROLES,
  RECOMMENDATION_TYPES,
  RECOMMENDATION_SEVERITIES,
  VARIANT_STYLES,
} from "./enums";

// ─────────────────────────── Auth ───────────────────────────

export const registerSchema = z.object({
  email: z.string().email("כתובת אימייל לא תקינה"),
  password: z.string().min(8, "הסיסמה חייבת לפחות 8 תווים"),
  name: z.string().min(2, "יש להזין שם"),
  organizationName: z.string().min(2, "יש להזין שם סוכנות"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email("כתובת אימייל לא תקינה"),
  password: z.string().min(1, "יש להזין סיסמה"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(1) });

// ─────────────────────────── Org / members ───────────────────────────

export const createMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  role: z.enum(ORG_ROLES),
  clientScope: z.array(z.string()).optional().default([]),
});
export type CreateMemberInput = z.infer<typeof createMemberSchema>;

export const updateMemberSchema = z.object({
  role: z.enum(ORG_ROLES).optional(),
  clientScope: z.array(z.string()).optional(),
});

export const updateOrgSchema = z.object({ name: z.string().min(2) });

// ─────────────────────────── Brand profile ───────────────────────────

export const proofSchema = z.object({ type: z.string(), description: z.string() });

export const brandProfileSchema = z.object({
  campaignGoal: z.enum(CAMPAIGN_GOALS).optional(),
  mainProduct: z.string().optional(),
  priceRange: z.string().optional(),
  keyBenefits: z.array(z.string()).optional().default([]),
  differentiation: z.string().optional(),
  customerPains: z.array(z.string()).optional().default([]),
  commonObjections: z.array(z.string()).optional().default([]),
  proofs: z.array(proofSchema).optional().default([]),
  brandTone: z.string().optional(),
  restrictions: z
    .object({
      forbiddenWords: z.array(z.string()).optional().default([]),
      forbiddenPromises: z.array(z.string()).optional().default([]),
      regulatoryNotes: z.string().optional(),
      sensitiveTopics: z.array(z.string()).optional().default([]),
    })
    .optional()
    .default({}),
});
export type BrandProfileInput = z.infer<typeof brandProfileSchema>;

// ─────────────────────────── Clients ───────────────────────────

export const createClientSchema = z.object({
  name: z.string().min(2, "יש להזין שם עסק"),
  industry: z.string().optional(),
  website: z.string().url("כתובת אתר לא תקינה").optional().or(z.literal("")),
  activityArea: z.string().optional(),
  language: z.string().default("he"),
  currency: z.string().default("ILS"),
  country: z.string().default("IL"),
  brandProfile: brandProfileSchema.optional(),
});
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = createClientSchema.partial().omit({ brandProfile: true });

export const createOfferSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.string().optional(),
  offerType: z.string().optional(),
});

export const createCompetitorSchema = z.object({
  name: z.string().min(1),
  website: z.string().optional(),
  notes: z.string().optional(),
  strengths: z.array(z.string()).optional().default([]),
  weaknesses: z.array(z.string()).optional().default([]),
});

// ─────────────────────────── Personas (agent output) ───────────────────────────

export const personaSchema = z.object({
  name: z.string(),
  ageRange: z.string().optional(),
  lifeSituation: z.string().optional(),
  pains: z.array(z.string()),
  desires: z.array(z.string()),
  fears: z.array(z.string()),
  objections: z.array(z.string()),
  emotionalTriggers: z.array(z.string()),
  conversionDrivers: z.array(z.string()),
  distrustTriggers: z.array(z.string()),
  copyStyle: z.string().optional(),
  creativeStyle: z.string().optional(),
  matchingOffers: z.array(z.string()),
  campaignAngles: z.array(z.string()),
});
export const personaListSchema = z.array(personaSchema).min(1).max(6);
export type PersonaSchema = z.infer<typeof personaSchema>;

export const generatePersonasSchema = z.object({
  count: z.number().int().min(3).max(5).optional().default(4),
});

// ─────────────────────────── Research (agent output) ───────────────────────────

export const researchSchema = z.object({
  marketSummary: z.string(),
  competitorInsights: z.array(z.string()),
  opportunities: z.array(z.string()),
  recommendedAngles: z.array(z.string()),
});
export type ResearchSchema = z.infer<typeof researchSchema>;

// ─────────────────────────── Strategy (agent output) ───────────────────────────

export const strategySchema = z.object({
  summary: z.string(),
  structure: z.object({
    campaigns: z.array(
      z.object({
        name: z.string(),
        goal: z.enum(CAMPAIGN_GOALS),
        budgetSharePct: z.number(),
        funnelStage: z.enum(["TOF", "MOF", "BOF"]),
      }),
    ),
  }),
  budgetSplit: z.array(
    z.object({ name: z.string(), sharePct: z.number(), rationale: z.string() }),
  ),
  abTestPlan: z.array(
    z.object({
      hypothesis: z.string(),
      variable: z.string(),
      variants: z.array(z.string()),
      minSpend: z.number(),
      kpi: z.string(),
    }),
  ),
  kpis: z.array(z.object({ name: z.string(), target: z.string(), stage: z.string() })),
  rules: z.object({
    killRules: z.array(z.string()),
    scaleRules: z.array(z.string()),
    refreshRules: z.array(z.string()),
  }),
});
export type StrategySchema = z.infer<typeof strategySchema>;

// ─────────────────────────── Ad generation (agent output) ───────────────────────────

export const adVariantSchema = z.object({
  personaName: z.string().optional(),
  angle: z.string(),
  hook: z.string(),
  primaryText: z.string(),
  headline: z.string(),
  description: z.string(),
  cta: z.string(),
  creativeBrief: z.object({
    concept: z.string(),
    visualDirection: z.string(),
    textOnImage: z.string().optional(),
    format: z.enum(["IMAGE", "VIDEO", "CAROUSEL"]),
  }),
  complianceNotes: z.string(),
  confidenceScore: z.number(),
  whyItWorks: z.string(),
  variantStyle: z.enum(VARIANT_STYLES),
});

export const adGenerationSchema = z.object({
  angles: z.array(z.string()),
  hooks: z.array(z.string()),
  primaryTexts: z.array(z.string()),
  headlines: z.array(z.string()),
  descriptions: z.array(z.string()),
  ctas: z.array(z.string()),
  imageIdeas: z.array(z.string()),
  videoIdeas: z.array(z.string()),
  adVariants: z.array(adVariantSchema),
});
export type AdGenerationSchema = z.infer<typeof adGenerationSchema>;

export const complianceSchema = z.object({
  verdict: z.enum(["PASS", "WARN", "BLOCK"]),
  issues: z.array(
    z.object({
      ruleId: z.string(),
      severity: z.string(),
      excerpt: z.string(),
      fix: z.string(),
    }),
  ),
  notes: z.string(),
});
export type ComplianceSchema = z.infer<typeof complianceSchema>;

export const optimizationSchema = z.object({
  recommendations: z.array(
    z.object({
      type: z.enum(RECOMMENDATION_TYPES),
      severity: z.enum(RECOMMENDATION_SEVERITIES),
      title: z.string(),
      body: z.string(),
      evidence: z.record(z.unknown()).optional().default({}),
    }),
  ),
});
export type OptimizationSchema = z.infer<typeof optimizationSchema>;

// ─────────────────────────── Campaigns ───────────────────────────

export const createCampaignSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(2, "יש להזין שם קמפיין"),
  goal: z.enum(CAMPAIGN_GOALS),
  budgetType: z.enum(BUDGET_TYPES).default("DAILY"),
  budgetAmount: z.number().int().positive("תקציב חייב להיות חיובי").optional(),
  currency: z.string().default("ILS"),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  targetingDraft: z.record(z.unknown()).optional().default({}),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = createCampaignSchema
  .partial()
  .omit({ clientId: true });

export const generateAdsSchema = z.object({
  personaIds: z.array(z.string()).optional().default([]),
  variantCount: z.number().int().min(1).max(10).optional().default(6),
});

export const decideApprovalSchema = z.object({ reason: z.string().optional() });

export const decideRecommendationSchema = z.object({
  decision: z.enum(["ACKNOWLEDGED", "APPLIED", "DISMISSED"]),
});

export const generateRecommendationsSchema = z.object({ clientId: z.string().min(1) });
