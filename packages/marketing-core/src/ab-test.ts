// Deterministic A/B test analysis. Given two variants' aggregated metrics, runs a
// two-proportion z-test on the conversion rate and reports significance, lift and a
// human recommendation. Pure functions — no data access, no side effects. This
// closes the strategy→execution→measurement loop (strategy generates an A/B plan;
// this decides whether a test reached a verdict). Source: council analytics v1.

export interface AbVariantInput {
  id: string;
  label: string;
  /** Denominator of the rate (e.g. clicks for CVR, impressions for CTR). */
  trials: number;
  /** Numerator of the rate (e.g. leads/conversions, or clicks for CTR). */
  successes: number;
}

export interface AbVariantStat {
  id: string;
  label: string;
  trials: number;
  successes: number;
  /** Conversion rate in [0,1]. */
  rate: number;
}

export interface AbTestResult {
  metric: string;
  control: AbVariantStat;
  variant: AbVariantStat;
  /** Higher-rate variant id when the result is significant, else null. */
  winnerId: string | null;
  zScore: number;
  pValue: number;
  /** Confidence that the difference is real, as a percentage (100·(1−p)). */
  confidencePct: number;
  /** Lift of `variant` over `control`, as a percentage of the control rate. */
  relativeLiftPct: number;
  isSignificant: boolean;
  sufficientSample: boolean;
  recommendation: string;
}

const MIN_TRIALS = 100; // per-variant floor before a verdict is trustworthy
const MIN_TOTAL_SUCCESSES = 15; // pooled successes floor
const ALPHA = 0.05;

/** Standard normal CDF via an Abramowitz–Stegun erf approximation (max err ~1.5e-7). */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Two-tailed two-proportion z-test. Returns z and p for H0: p1 = p2. */
export function twoProportionZTest(
  s1: number,
  n1: number,
  s2: number,
  n2: number,
): { z: number; p: number } {
  if (n1 <= 0 || n2 <= 0) return { z: 0, p: 1 };
  const p1 = s1 / n1;
  const p2 = s2 / n2;
  const pooled = (s1 + s2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return { z: 0, p: 1 };
  const z = (p2 - p1) / se;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { z, p: Math.min(1, Math.max(0, p)) };
}

function stat(v: AbVariantInput): AbVariantStat {
  const trials = Math.max(0, Math.round(v.trials));
  const successes = Math.max(0, Math.round(v.successes));
  return { id: v.id, label: v.label, trials, successes, rate: trials > 0 ? successes / trials : 0 };
}

/**
 * Evaluate an A/B test between a control and a variant. The one with the LOWER rate
 * is treated as control so lift reads as "variant beats control by X%".
 */
export function evaluateAbTest(
  a: AbVariantInput,
  b: AbVariantInput,
  metric = "יחס המרה (לידים/קליקים)",
): AbTestResult {
  const sa = stat(a);
  const sb = stat(b);
  // control = lower rate, variant = higher rate (stable, deterministic tie-break by id)
  const aIsControl = sa.rate < sb.rate || (sa.rate === sb.rate && sa.id <= sb.id);
  const control = aIsControl ? sa : sb;
  const variant = aIsControl ? sb : sa;

  const { z, p } = twoProportionZTest(control.successes, control.trials, variant.successes, variant.trials);
  const sufficientSample =
    control.trials >= MIN_TRIALS &&
    variant.trials >= MIN_TRIALS &&
    control.successes + variant.successes >= MIN_TOTAL_SUCCESSES;
  const isSignificant = sufficientSample && p < ALPHA;
  const relativeLiftPct = control.rate > 0 ? ((variant.rate - control.rate) / control.rate) * 100 : 0;
  const confidencePct = (1 - p) * 100;

  let recommendation: string;
  if (!sufficientSample) {
    recommendation = `אין עדיין מספיק דאטה להכרעה (נדרשים ≥${MIN_TRIALS} טריאלים לכל וריאציה ו-≥${MIN_TOTAL_SUCCESSES} המרות סה״כ). המשך להריץ.`;
  } else if (isSignificant) {
    recommendation = `וריאציה "${variant.label}" מנצחת בביטחון ${confidencePct.toFixed(1)}% (שיפור ${relativeLiftPct.toFixed(0)}%). מומלץ להעביר תקציב אליה ולכבות את "${control.label}".`;
  } else {
    recommendation = `אין הבדל מובהק סטטיסטית (p=${p.toFixed(3)}, ביטחון ${confidencePct.toFixed(1)}%). המשך להריץ או בחן זווית נבדלת יותר.`;
  }

  return {
    metric,
    control,
    variant,
    winnerId: isSignificant ? variant.id : null,
    zScore: Number(z.toFixed(4)),
    pValue: Number(p.toFixed(5)),
    confidencePct: Number(confidencePct.toFixed(2)),
    relativeLiftPct: Number(relativeLiftPct.toFixed(2)),
    isSignificant,
    sufficientSample,
    recommendation,
  };
}

/**
 * From a set of variants, pick the two with the most trials and evaluate them.
 * Returns null when fewer than two variants have any traffic.
 */
export function evaluateTopTwo(variants: AbVariantInput[], metric?: string): AbTestResult | null {
  const withTraffic = variants.filter((v) => v.trials > 0).sort((x, y) => y.trials - x.trials);
  if (withTraffic.length < 2) return null;
  return evaluateAbTest(withTraffic[0], withTraffic[1], metric);
}

/**
 * Required sample size PER VARIANT for a two-proportion test at 95%/80% power,
 * given a baseline rate and a minimum detectable effect (relative, e.g. 0.2 = +20%).
 * Useful for A/B planning ("how long must this run?").
 */
export function requiredSampleSizePerVariant(baselineRate: number, mdeRelative: number): number {
  const p1 = Math.min(0.999, Math.max(0.001, baselineRate));
  const p2 = Math.min(0.999, Math.max(0.001, p1 * (1 + mdeRelative)));
  const zAlpha = 1.959964; // two-sided 95%
  const zBeta = 0.841621; // 80% power
  const pBar = (p1 + p2) / 2;
  const delta = Math.abs(p2 - p1);
  if (delta === 0) return Infinity;
  const n =
    Math.pow(zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)), 2) /
    Math.pow(delta, 2);
  return Math.ceil(n);
}
