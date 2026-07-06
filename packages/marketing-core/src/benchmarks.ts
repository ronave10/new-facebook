// KPI benchmark table — Israeli market (ILS). Values are p25/p50/p75:
// p25 = strong, p50 = typical, p75 = alert threshold. Seed data for onboarding
// targets and the alert engine's market fallback. Source: council marketing expert v1.

export type BenchmarkTriplet = { p25: number; p50: number; p75: number };

/** CPL (instant lead form) in ILS by vertical. */
export const CPL_BY_VERTICAL: Record<string, BenchmarkTriplet> = {
  home_services: { p25: 25, p50: 45, p75: 80 },
  fitness: { p25: 15, p50: 30, p75: 55 },
  beauty: { p25: 15, p50: 28, p75: 50 },
  medical_aesthetics: { p25: 40, p50: 80, p75: 150 },
  dental: { p25: 40, p50: 80, p75: 150 },
  real_estate: { p25: 60, p50: 120, p75: 250 },
  law: { p25: 50, p50: 100, p75: 200 },
  finance_insurance: { p25: 60, p50: 110, p75: 220 },
  education_courses: { p25: 25, p50: 50, p75: 90 },
  coaching: { p25: 30, p50: 55, p75: 100 },
  b2b_services: { p25: 80, p50: 160, p75: 320 },
  events_tourism: { p25: 20, p50: 40, p75: 75 },
};

/** Objective-level CPM baselines (ILS). */
export const CPM_BY_OBJECTIVE: Record<string, BenchmarkTriplet> = {
  AWARENESS: { p25: 8, p50: 14, p75: 22 },
  TRAFFIC: { p25: 12, p50: 20, p75: 32 },
  ENGAGEMENT: { p25: 10, p50: 16, p75: 26 },
  MESSAGES: { p25: 18, p50: 30, p75: 48 },
  LEADS: { p25: 20, p50: 35, p75: 55 },
  SALES: { p25: 25, p50: 42, p75: 70 },
  REMARKETING: { p25: 30, p50: 50, p75: 85 },
};

/** Link CTR (%) targets — higher is better, so order is p75(strong)/p50/p25(weak). */
export const CTR_TARGET_PCT = { strong: 1.5, typical: 1.0, weak: 0.6 };

const DEFAULT_CPL: BenchmarkTriplet = { p25: 30, p50: 60, p75: 120 };

export function cplBenchmark(vertical?: string | null): BenchmarkTriplet {
  if (!vertical) return DEFAULT_CPL;
  const key = normalizeVertical(vertical);
  return CPL_BY_VERTICAL[key] ?? DEFAULT_CPL;
}

/** Maps free-text Hebrew/English industry to a benchmark key. */
export function normalizeVertical(vertical: string): string {
  const v = vertical.toLowerCase();
  if (/(שיפוץ|מיזוג|אינסטלצ|home|renovat|hvac)/.test(v)) return "home_services";
  if (/(כושר|פיטנס|fitness|gym|סטודיו)/.test(v)) return "fitness";
  if (/(שיניים|dental)/.test(v)) return "dental";
  if (/(אסתטי|aesthet|בוטוקס|קוסמט)/.test(v)) return "medical_aesthetics";
  if (/(יופי|beauty|קוסמטיק|ספא)/.test(v)) return "beauty";
  if (/(נדל|real.?estate|דירות|יזם)/.test(v)) return "real_estate";
  if (/(עו\"?ד|משפט|law|עורך דין)/.test(v)) return "law";
  if (/(ביטוח|פיננס|משכנת|finance|insurance|mortgage)/.test(v)) return "finance_insurance";
  if (/(קורס|הדרכ|לימוד|course|education)/.test(v)) return "education_courses";
  if (/(אימון|קואוצ|coach|ייעוץ)/.test(v)) return "coaching";
  if (/(b2b|saas|תוכנה)/.test(v)) return "b2b_services";
  if (/(אירוע|תיירות|event|tourism|טיול)/.test(v)) return "events_tourism";
  return "other";
}

export type BenchmarkVerdict = "strong" | "typical" | "alert";

/** For "lower is better" metrics (CPL/CPA/CPM/CPC). */
export function verdictLowerIsBetter(value: number, b: BenchmarkTriplet): BenchmarkVerdict {
  if (value <= b.p25) return "strong";
  if (value <= b.p75) return "typical";
  return "alert";
}
