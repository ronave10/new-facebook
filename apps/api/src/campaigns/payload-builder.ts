import {
  GOAL_TO_META_OBJECTIVE,
  GOAL_TO_OPTIMIZATION_GOAL,
  type CampaignGoal,
} from "@campaignos/shared";

export interface PublishStep {
  step: number;
  action: "create_campaign" | "create_ad_set" | "create_creative" | "create_ad" | "activate";
  /** Human-readable Hebrew label of what this step does. */
  label: string;
  /** The exact spec that will be sent to the connector. */
  spec: Record<string, unknown>;
  /** Local ref so publish can wire meta ids back. */
  ref: { type: "campaign" | "ad_set" | "creative" | "ad"; localId: string };
}

export interface CampaignBundle {
  campaign: {
    id: string;
    name: string;
    goal: CampaignGoal;
    budgetType: string;
    budgetAmount: number | null;
    currency: string;
    specialAdCategories: string[];
    startAt: Date | null;
    endAt: Date | null;
    targetingDraft: unknown;
  };
  adAccountId: string;
  pageId?: string;
  igAccountId?: string;
  pixelId?: string;
  adSets: {
    id: string;
    name: string;
    optimizationGoal: string | null;
    billingEvent: string | null;
    budgetAmount: number | null;
    targeting: unknown;
    ads: {
      id: string;
      name: string;
      creativeId: string | null;
      creativeName: string;
      primaryText: string | null;
      headline: string | null;
      description: string | null;
      cta: string | null;
      destinationUrl: string | null;
      imageUrl?: string | null;
    }[];
  }[];
}

interface Targeting {
  countries?: string[];
  ageMin?: number;
  ageMax?: number;
  advantageAudience?: boolean;
}

/**
 * Builds the EXACT, deterministic ordered list of Meta API calls that publishing
 * will perform. Shown verbatim to the user on Review & Approve and hashed so the
 * publish step can detect drift. Ordering is stable (campaign → per adset: adset,
 * then per ad: creative, ad → activations) so hashes are reproducible.
 */
export function buildPublishPlan(bundle: CampaignBundle): PublishStep[] {
  const steps: PublishStep[] = [];
  let n = 0;
  const c = bundle.campaign;
  const objective = c.goal ? GOAL_TO_META_OBJECTIVE[c.goal] : "OUTCOME_LEADS";
  const optimizationGoal = c.goal ? GOAL_TO_OPTIMIZATION_GOAL[c.goal] : "LEAD_GENERATION";
  const t = (c.targetingDraft ?? {}) as Targeting;

  const campaignSpec: Record<string, unknown> = {
    name: c.name,
    objective,
    status: "PAUSED",
    specialAdCategories: c.specialAdCategories ?? [],
  };
  if (c.budgetType === "DAILY" && c.budgetAmount) campaignSpec.dailyBudget = c.budgetAmount;
  if (c.budgetType === "LIFETIME" && c.budgetAmount) campaignSpec.lifetimeBudget = c.budgetAmount;
  steps.push({
    step: ++n,
    action: "create_campaign",
    label: `יצירת קמפיין "${c.name}" (${objective}) במצב מושהה`,
    spec: campaignSpec,
    ref: { type: "campaign", localId: c.id },
  });

  for (const adSet of bundle.adSets) {
    const targeting = (adSet.targeting ?? {}) as Targeting;
    const geo = { countries: targeting.countries ?? t.countries ?? ["IL"] };
    const adSetSpec: Record<string, unknown> = {
      name: adSet.name,
      optimizationGoal: adSet.optimizationGoal ?? optimizationGoal,
      billingEvent: adSet.billingEvent ?? "IMPRESSIONS",
      status: "PAUSED",
      targeting: {
        geoLocations: geo,
        ageMin: targeting.ageMin ?? t.ageMin ?? 18,
        ageMax: targeting.ageMax ?? t.ageMax ?? 65,
        advantageAudience: targeting.advantageAudience ?? true,
      },
    };
    if (adSet.budgetAmount) adSetSpec.dailyBudget = adSet.budgetAmount;
    if (bundle.pixelId) adSetSpec.promotedObject = { pixelId: bundle.pixelId };
    steps.push({
      step: ++n,
      action: "create_ad_set",
      label: `יצירת קבוצת מודעות "${adSet.name}" במצב מושהה`,
      spec: adSetSpec,
      ref: { type: "ad_set", localId: adSet.id },
    });

    for (const ad of adSet.ads) {
      steps.push({
        step: ++n,
        action: "create_creative",
        label: `יצירת קריאייטיב "${ad.creativeName}"`,
        spec: {
          name: ad.creativeName,
          pageId: bundle.pageId ?? "",
          instagramUserId: bundle.igAccountId,
          linkUrl: ad.destinationUrl ?? "",
          message: ad.primaryText ?? "",
          headline: ad.headline ?? "",
          description: ad.description ?? "",
          callToActionType: mapCta(ad.cta),
          ...(ad.imageUrl ? { imageUrl: ad.imageUrl } : {}),
        },
        ref: { type: "creative", localId: ad.creativeId ?? ad.id },
      });
      steps.push({
        step: ++n,
        action: "create_ad",
        label: `יצירת מודעה "${ad.name}" במצב מושהה`,
        spec: { name: ad.name, status: "PAUSED" },
        ref: { type: "ad", localId: ad.id },
      });
    }
  }

  // activations, top-down (campaign → ad sets → ads)
  steps.push({
    step: ++n,
    action: "activate",
    label: `הפעלת הקמפיין "${c.name}"`,
    spec: { entityType: "campaign" },
    ref: { type: "campaign", localId: c.id },
  });
  for (const adSet of bundle.adSets) {
    steps.push({
      step: ++n,
      action: "activate",
      label: `הפעלת קבוצת המודעות "${adSet.name}"`,
      spec: { entityType: "ad_set" },
      ref: { type: "ad_set", localId: adSet.id },
    });
    for (const ad of adSet.ads) {
      steps.push({
        step: ++n,
        action: "activate",
        label: `הפעלת המודעה "${ad.name}"`,
        spec: { entityType: "ad" },
        ref: { type: "ad", localId: ad.id },
      });
    }
  }

  return steps;
}

const CTA_MAP: Record<string, string> = {
  "השאירו פרטים": "SIGN_UP",
  "קבעו שיחה": "BOOK_TRAVEL",
  "לפרטים נוספים": "LEARN_MORE",
  "הצטרפו עכשיו": "SIGN_UP",
  "קבלו הצעה": "GET_OFFER",
  "צרו קשר": "CONTACT_US",
  "קנו עכשיו": "SHOP_NOW",
};

function mapCta(cta: string | null): string {
  if (!cta) return "LEARN_MORE";
  return CTA_MAP[cta] ?? "LEARN_MORE";
}
