// Deterministic Kill / Scale / Refresh rules. Each is a pure function over an
// aggregated metrics window → a recommendation (or null). NOTHING auto-executes;
// these produce evidence-backed suggestions that require human approval.
// Source: council marketing expert v1 (rules K1–K5, S1–S3, R1–R2).

import type { RecommendationSeverity, RecommendationType } from "@campaignos/shared";

export interface EntityMetrics {
  entityId: string;
  entityName: string;
  level: "CAMPAIGN" | "AD_SET" | "AD";
  spend: number; // ILS, window total
  impressions: number;
  clicks: number;
  leads: number;
  conversions: number;
  daysLive: number;
  frequency?: number; // avg over window
  ctrPct?: number; // link CTR %
  cpm?: number;
}

export interface RuleTargets {
  targetCpaIls: number; // target CPL/CPA
  cpmP50: number; // vertical/objective p50 for dead-creative check
}

export interface RuleFinding {
  ruleId: string;
  type: RecommendationType;
  severity: RecommendationSeverity;
  title: string;
  body: string;
  evidence: Record<string, number | string>;
  entityId: string;
}

const has = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** Statistical gate: enough data to judge an ad? */
function adGatePassed(m: EntityMetrics): boolean {
  return m.impressions >= 8000 || m.daysLive >= 4;
}

/** Statistical gate for conversion verdicts: the "3x rule". */
function conversionGatePassed(m: EntityMetrics, t: RuleTargets): boolean {
  return m.spend >= 3 * t.targetCpaIls && m.daysLive >= 4;
}

function cpa(m: EntityMetrics): number | undefined {
  const results = m.conversions || m.leads;
  return results > 0 ? m.spend / results : undefined;
}

// ── KILL rules ──

/** K1 zero-converter: spend ≥ 3× target CPA with 0 results. */
export function ruleK1(m: EntityMetrics, t: RuleTargets): RuleFinding | null {
  const results = m.conversions || m.leads;
  if (m.spend >= 3 * t.targetCpaIls && results === 0) {
    return {
      ruleId: "K1",
      type: "KILL_AD",
      severity: "CRITICAL",
      title: `כבה: "${m.entityName}" ללא תוצאות`,
      body: `הוצאה ₪${m.spend.toFixed(0)} (פי ${(m.spend / t.targetCpaIls).toFixed(1)} מיעד ה-CPA ₪${t.targetCpaIls}) ללא אף המרה. מומלץ לכבות ולהעביר תקציב למנצחות.`,
      evidence: { spend: round(m.spend), results: 0, targetCpa: t.targetCpaIls, rule: "K1" },
      entityId: m.entityId,
    };
  }
  return null;
}

/** K2 expensive-converter: spend ≥ 5× target CPA and actual CPA > 2× target. */
export function ruleK2(m: EntityMetrics, t: RuleTargets): RuleFinding | null {
  const actual = cpa(m);
  if (has(actual) && m.spend >= 5 * t.targetCpaIls && actual > 2 * t.targetCpaIls) {
    return {
      ruleId: "K2",
      type: "KILL_AD",
      severity: "WARNING",
      title: `כבה: "${m.entityName}" יקר מדי`,
      body: `CPA בפועל ₪${actual.toFixed(0)} — פי ${(actual / t.targetCpaIls).toFixed(1)} מהיעד (₪${t.targetCpaIls}) על פני הוצאה של ₪${m.spend.toFixed(0)}.`,
      evidence: { cpa: round(actual), targetCpa: t.targetCpaIls, spend: round(m.spend), rule: "K2" },
      entityId: m.entityId,
    };
  }
  return null;
}

/** K3 dead-creative: CTR < 0.5% after ≥ 8,000 impressions AND CPM above p50. */
export function ruleK3(m: EntityMetrics, t: RuleTargets): RuleFinding | null {
  if (m.level !== "AD") return null;
  if (m.impressions >= 8000 && has(m.ctrPct) && m.ctrPct < 0.5 && has(m.cpm) && m.cpm > t.cpmP50) {
    return {
      ruleId: "K3",
      type: "REFRESH_CREATIVE",
      severity: "WARNING",
      title: `רענן קריאייטיב: "${m.entityName}"`,
      body: `CTR ${m.ctrPct.toFixed(2)}% (מתחת ל-0.5%) אחרי ${m.impressions.toLocaleString()} חשיפות, ו-CPM ₪${m.cpm.toFixed(0)} מעל החציון. הקריאייטיב נכשל במכרז — מומלץ להחליף.`,
      evidence: { ctr: m.ctrPct, impressions: m.impressions, cpm: round(m.cpm), rule: "K3" },
      entityId: m.entityId,
    };
  }
  return null;
}

// ── SCALE rules ──

/** S1 steady-winner: CPA ≤ 0.8× target over ≥5 results and ≥3 days → +20%. */
export function ruleS1(m: EntityMetrics, t: RuleTargets): RuleFinding | null {
  const results = m.conversions || m.leads;
  const actual = cpa(m);
  if (has(actual) && results >= 5 && m.daysLive >= 3 && actual <= 0.8 * t.targetCpaIls) {
    return {
      ruleId: "S1",
      type: "SCALE_BUDGET",
      severity: "SUGGESTION",
      title: `הגדל תקציב: "${m.entityName}" מנצח`,
      body: `CPA ₪${actual.toFixed(0)} (${(actual / t.targetCpaIls).toFixed(2)}× מהיעד) על פני ${results} תוצאות ו-${m.daysLive} ימים יציבים. מומלץ להגדיל תקציב ב-20% (המתן 48 שעות בין הגדלות כדי לא לאפס למידה).`,
      evidence: { cpa: round(actual), targetCpa: t.targetCpaIls, results, rule: "S1" },
      entityId: m.entityId,
    };
  }
  return null;
}

/** S2 strong-winner: CPA ≤ 0.6× target over ≥10 results → +30% + horizontal. */
export function ruleS2(m: EntityMetrics, t: RuleTargets): RuleFinding | null {
  const results = m.conversions || m.leads;
  const actual = cpa(m);
  if (has(actual) && results >= 10 && actual <= 0.6 * t.targetCpaIls) {
    return {
      ruleId: "S2",
      type: "SCALE_BUDGET",
      severity: "SUGGESTION",
      title: `סקייל אגרסיבי: "${m.entityName}"`,
      body: `CPA ₪${actual.toFixed(0)} — נמוך במיוחד (${(actual / t.targetCpaIls).toFixed(2)}× מהיעד) על פני ${results} תוצאות. מומלץ +30% עכשיו + שכפול הקבוצה עם הרחבת גיל/אזור או שכבת LAL חדשה.`,
      evidence: { cpa: round(actual), targetCpa: t.targetCpaIls, results, rule: "S2" },
      entityId: m.entityId,
    };
  }
  return null;
}

// ── REFRESH rule ──

/** R1 fatigue: frequency > 3 and CTR present → refresh. */
export function ruleR1(m: EntityMetrics): RuleFinding | null {
  if (has(m.frequency) && m.frequency > 3.5) {
    return {
      ruleId: "R1",
      type: "REFRESH_CREATIVE",
      severity: "SUGGESTION",
      title: `שחיקה: "${m.entityName}"`,
      body: `תדירות ${m.frequency.toFixed(1)} — הקהל ראה את המודעה יותר מדי פעמים. מומלץ להזרים וריאציה חדשה כדי למנוע ירידת ביצועים.`,
      evidence: { frequency: m.frequency, rule: "R1" },
      entityId: m.entityId,
    };
  }
  return null;
}

const KILL_RULES = [ruleK1, ruleK2, ruleK3];
const SCALE_RULES = [ruleS1, ruleS2];

/**
 * Evaluates all rules against a set of entities. Applies statistical gates so we
 * never judge an under-powered entity. Returns de-duplicated findings, most
 * severe first.
 */
export function evaluateRules(entities: EntityMetrics[], targets: RuleTargets): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const sevRank: Record<RecommendationSeverity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1, INFO: 0 };

  for (const m of entities) {
    const seenTypes = new Set<string>();
    const push = (f: RuleFinding | null) => {
      if (f && !seenTypes.has(f.type)) {
        findings.push(f);
        seenTypes.add(f.type);
      }
    };

    // Kill/expensive verdicts require the conversion gate; K3 requires the ad gate.
    if (conversionGatePassed(m, targets)) {
      push(ruleK1(m, targets));
      push(ruleK2(m, targets));
    }
    if (adGatePassed(m)) {
      push(ruleK3(m, targets));
      push(ruleR1(m));
    }
    // Scale only when there is a stable, positive signal.
    if (m.daysLive >= 3) {
      push(ruleS2(m, targets));
      push(ruleS1(m, targets));
    }
  }

  return findings.sort((a, b) => sevRank[b.severity] - sevRank[a.severity]);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
