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
  /** Wilson 95% confidence interval for the rate. */
  ciLower: number;
  ciUpper: number;
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
  /** 95% CI for the ABSOLUTE difference in rates (variant − control), in rate points. */
  diffCiLower: number;
  diffCiUpper: number;
  isSignificant: boolean;
  sufficientSample: boolean;
  /** Extra days to reach significance at the current traffic rate, or null if N/A. */
  projectedDaysToSignificance: number | null;
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

const Z95 = 1.959964;

/** Wilson score interval for a binomial proportion — robust at small n and extreme rates. */
export function wilsonInterval(successes: number, trials: number, z = Z95): { lower: number; upper: number } {
  if (trials <= 0) return { lower: 0, upper: 0 };
  const p = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) / denom;
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

function stat(v: AbVariantInput): AbVariantStat {
  const trials = Math.max(0, Math.round(v.trials));
  const successes = Math.max(0, Math.round(v.successes));
  const ci = wilsonInterval(successes, trials);
  return {
    id: v.id,
    label: v.label,
    trials,
    successes,
    rate: trials > 0 ? successes / trials : 0,
    ciLower: ci.lower,
    ciUpper: ci.upper,
  };
}

/**
 * Evaluate an A/B test between a control and a variant. The one with the LOWER rate
 * is treated as control so lift reads as "variant beats control by X%".
 */
export function evaluateAbTest(
  a: AbVariantInput,
  b: AbVariantInput,
  metric = "יחס המרה (לידים/קליקים)",
  /** Optional: observed trials/day PER VARIANT — enables a days-to-significance projection. */
  dailyTrialsPerVariant?: number,
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

  // 95% CI for the absolute difference (variant − control), unpooled SE.
  const p1 = control.rate;
  const p2 = variant.rate;
  const seDiff =
    control.trials > 0 && variant.trials > 0
      ? Math.sqrt((p1 * (1 - p1)) / control.trials + (p2 * (1 - p2)) / variant.trials)
      : 0;
  const diff = p2 - p1;
  const diffCiLower = diff - Z95 * seDiff;
  const diffCiUpper = diff + Z95 * seDiff;

  // Days-to-significance: sample needed to detect the OBSERVED effect, vs current traffic.
  let projectedDaysToSignificance: number | null = null;
  if (isSignificant) {
    projectedDaysToSignificance = 0;
  } else if (
    typeof dailyTrialsPerVariant === "number" &&
    dailyTrialsPerVariant > 0 &&
    control.rate > 0 &&
    variant.rate > control.rate
  ) {
    const required = requiredSampleSizePerVariant(control.rate, (variant.rate - control.rate) / control.rate);
    if (Number.isFinite(required)) {
      const remaining = Math.max(0, required - Math.min(control.trials, variant.trials));
      projectedDaysToSignificance = Math.ceil(remaining / dailyTrialsPerVariant);
    }
  }

  let recommendation: string;
  if (!sufficientSample) {
    const proj =
      projectedDaysToSignificance && projectedDaysToSignificance > 0
        ? ` בקצב הנוכחי צפויה הכרעה בעוד ~${projectedDaysToSignificance} ימים.`
        : "";
    recommendation = `אין עדיין מספיק דאטה להכרעה (נדרשים ≥${MIN_TRIALS} טריאלים לכל וריאציה ו-≥${MIN_TOTAL_SUCCESSES} המרות סה״כ). המשך להריץ.${proj}`;
  } else if (isSignificant) {
    recommendation = `וריאציה "${variant.label}" מנצחת בביטחון ${confidencePct.toFixed(1)}% (שיפור ${relativeLiftPct.toFixed(0)}%). מומלץ להעביר תקציב אליה ולכבות את "${control.label}".`;
  } else {
    const proj =
      projectedDaysToSignificance && projectedDaysToSignificance > 0
        ? ` בקצב הנוכחי צפויה הכרעה בעוד ~${projectedDaysToSignificance} ימים.`
        : " ההפרש קטן מכדי להכריע — שקול זווית נבדלת יותר.";
    recommendation = `אין הבדל מובהק סטטיסטית (p=${p.toFixed(3)}, ביטחון ${confidencePct.toFixed(1)}%).${proj}`;
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
    diffCiLower: Number(diffCiLower.toFixed(5)),
    diffCiUpper: Number(diffCiUpper.toFixed(5)),
    isSignificant,
    sufficientSample,
    projectedDaysToSignificance,
    recommendation,
  };
}

/**
 * From a set of variants, pick the two with the most trials and evaluate them.
 * Returns null when fewer than two variants have any traffic.
 */
export function evaluateTopTwo(
  variants: AbVariantInput[],
  metric?: string,
  dailyTrialsPerVariant?: number,
): AbTestResult | null {
  const withTraffic = variants.filter((v) => v.trials > 0).sort((x, y) => y.trials - x.trials);
  if (withTraffic.length < 2) return null;
  return evaluateAbTest(withTraffic[0], withTraffic[1], metric, dailyTrialsPerVariant);
}

/** Evaluate two specific variants selected by id (explicit A/B comparison). */
export function evaluateByIds(
  variants: AbVariantInput[],
  aId: string,
  bId: string,
  metric?: string,
  dailyTrialsPerVariant?: number,
): AbTestResult | null {
  const a = variants.find((v) => v.id === aId);
  const b = variants.find((v) => v.id === bId);
  if (!a || !b || a.id === b.id) return null;
  return evaluateAbTest(a, b, metric, dailyTrialsPerVariant);
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
