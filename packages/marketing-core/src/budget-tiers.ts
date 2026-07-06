// Deterministic budget-tier templates (ILS/day). The LLM writes names/rationale;
// the STRUCTURE comes from here. Source: council marketing expert v1.

export type FunnelStage = "TOF" | "MOF" | "BOF";

export interface BudgetAllocation {
  name: string;
  sharePct: number;
  funnelStage: FunnelStage;
  adSets: number;
  adsPerAdSet: number;
  note: string;
}

export interface BudgetTier {
  tier: "A" | "B" | "C";
  label: string;
  dailyRangeIls: [number, number | null];
  allocations: BudgetAllocation[];
  testingCadence: string;
}

export interface PixelStats {
  pixelExists: boolean;
  purchases90d: number;
  leads90d: number;
  siteVisitors30d: number;
  pageEngagers90d: number;
  igEngagers90d: number;
  customerListSize: number;
}

export const EMPTY_PIXEL_STATS: PixelStats = {
  pixelExists: false,
  purchases90d: 0,
  leads90d: 0,
  siteVisitors30d: 0,
  pageEngagers90d: 0,
  igEngagers90d: 0,
  customerListSize: 0,
};

/** Can we run a separate remarketing ad set? Needs warm audience signal. */
export function canRemarket(stats: PixelStats): boolean {
  return stats.siteVisitors30d > 0 || stats.pageEngagers90d > 0 || stats.igEngagers90d > 0;
}

/** Can we build a lookalike? Needs a large-enough seed. */
export function canLookalike(stats: PixelStats): boolean {
  return stats.customerListSize >= 100 || stats.purchases90d >= 100 || stats.leads90d >= 100;
}

/**
 * Picks the budget-tier structure for a daily budget, gating the remarketing
 * layer on real warm-audience availability.
 */
export function recommendBudgetTier(dailyBudgetIls: number, stats: PixelStats = EMPTY_PIXEL_STATS): BudgetTier {
  const remarket = canRemarket(stats);

  if (dailyBudgetIls < 100) {
    return {
      tier: "A",
      label: "הישרדות (Survival)",
      dailyRangeIls: [0, 99],
      allocations: [
        {
          name: "פרוספקטינג — קהל רחב",
          sharePct: 100,
          funnelStage: "TOF",
          adSets: 1,
          adsPerAdSet: 3,
          note: "Advantage+ audience, ללא ערבוב תקציב בין שתי קבוצות בשלב למידה.",
        },
      ],
      testingCadence: "החלפת קריאייטיב כל 10–14 ימים, ללא שינויים מבניים.",
    };
  }

  if (dailyBudgetIls <= 500) {
    const allocations: BudgetAllocation[] = [
      {
        name: "פרוספקטינג",
        sharePct: remarket ? 70 : 85,
        funnelStage: "TOF",
        adSets: 2,
        adsPerAdSet: 3,
        note: "קבוצה רחבה (Advantage+) + קבוצת עניין ממוקדת.",
      },
    ];
    if (remarket) {
      allocations.push({
        name: "רימרקטינג",
        sharePct: 20,
        funnelStage: "MOF",
        adSets: 1,
        adsPerAdSet: 3,
        note: "מבקרי אתר 30 יום + מעורבים 90 יום. קופי שונה מהקר (הוכחה/התנגדות/הצעה).",
      });
    }
    allocations.push({
      name: "טסטינג",
      sharePct: remarket ? 10 : 15,
      funnelStage: "TOF",
      adSets: 1,
      adsPerAdSet: 2,
      note: "רוטציה של זוויות חדשות שבועית.",
    });
    return {
      tier: "B",
      label: "צמיחה (Growth)",
      dailyRangeIls: [100, 500],
      allocations,
      testingCadence: "בדיקת A/B של משתנה בודד; מינימום 7 ימים לזרוע.",
    };
  }

  const allocations: BudgetAllocation[] = [
    { name: "פרוספקטינג קר", sharePct: 55, funnelStage: "TOF", adSets: 3, adsPerAdSet: 3, note: "רחב + עניין + LAL." },
  ];
  if (remarket) {
    allocations.push({ name: "רימרקטינג (MOF)", sharePct: 20, funnelStage: "MOF", adSets: 2, adsPerAdSet: 3, note: "מדורג לפי חום הקהל." });
    allocations.push({ name: "סגירה (BOF)", sharePct: 15, funnelStage: "BOF", adSets: 1, adsPerAdSet: 2, note: "נטשי עגלה / לידים שלא סגרו." });
  }
  allocations.push({ name: "טסטינג", sharePct: remarket ? 10 : 25, funnelStage: "TOF", adSets: 2, adsPerAdSet: 2, note: "זוויות וקהלים חדשים." });
  return {
    tier: "C",
    label: "סקייל (Scale)",
    dailyRangeIls: [500, null],
    allocations,
    testingCadence: "בדיקות מובנות + סקייל אנכי (+20/30%) ואופקי (שכפול קבוצות).",
  };
}
