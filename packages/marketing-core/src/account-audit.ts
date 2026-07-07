// Account Health Audit — a deterministic, weighted 0-100 score across the
// categories that drive Meta ad performance. Inspired by the audit tools that
// anchor peer products (health score + prioritized findings), grounded in the
// same rule engine and IL benchmarks as the rest of marketing-core.

import { evaluateRules, type EntityMetrics, type RuleFinding } from "./optimization-rules";
import { cplBenchmark, normalizeVertical } from "./benchmarks";

export interface AuditInput {
  vertical?: string | null;
  pixelConnected: boolean;
  distinctCreatives: number;
  distinctVariantStyles: number;
  hasRemarketingAudience: boolean;
  hasLookalikeAudience: boolean;
  campaigns: {
    id: string;
    name: string;
    status: string; // PUBLISHED / PAUSED / DRAFT...
    adSetCount: number;
    adCount: number;
  }[];
  /** Aggregated per-campaign metrics over the audit window (from snapshots). */
  metrics: EntityMetrics[];
}

export type AuditSeverity = "CRITICAL" | "WARNING" | "SUGGESTION" | "INFO";

export interface AuditFinding {
  category: string;
  severity: AuditSeverity;
  title: string;
  detail: string;
  fix: string;
}

export interface AuditCategory {
  key: string;
  label: string;
  weight: number; // 0..1
  score: number; // 0..100
}

export interface AccountAudit {
  score: number; // 0..100
  grade: "A" | "B" | "C" | "D" | "F";
  categories: AuditCategory[];
  findings: AuditFinding[];
}

function grade(score: number): AccountAudit["grade"] {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function auditAccount(input: AuditInput): AccountAudit {
  const findings: AuditFinding[] = [];
  const targetCpa = cplBenchmark(input.vertical ? normalizeVertical(input.vertical) : null).p50;
  const liveCampaigns = input.campaigns.filter((c) => c.status === "PUBLISHED");

  // ── 1. Tracking / Pixel (weight 0.20) ──
  const trackingScore = input.pixelConnected ? 100 : 0;
  if (!input.pixelConnected) {
    findings.push({
      category: "tracking",
      severity: "CRITICAL",
      title: "אין פיקסל מחובר",
      detail: "ללא פיקסל אי אפשר לאופטם להמרות, לבנות קהלי רימרקטינג או למדוד ROAS.",
      fix: "חברו פיקסל דרך חשבון המודעות והתקינו אירועי המרה (Lead/Purchase).",
    });
  }

  // ── 2. Creative Diversity — "Andromeda" (weight 0.20) ──
  // Meta's delivery favors accounts with many genuinely distinct creatives.
  const diversityByCount = Math.min(100, (input.distinctCreatives / 10) * 100);
  const diversityByStyle = Math.min(100, (input.distinctVariantStyles / 5) * 100);
  const creativeScore = Math.round(0.7 * diversityByCount + 0.3 * diversityByStyle);
  if (input.distinctCreatives < 10) {
    findings.push({
      category: "creative",
      severity: input.distinctCreatives < 5 ? "WARNING" : "SUGGESTION",
      title: `רק ${input.distinctCreatives} קריאייטיבים ייחודיים`,
      detail: "אלגוריתם ההפצה של Meta מעדיף מגוון רחב של קריאייטיבים; מעט מדי גורם לדיכוי הצגה.",
      fix: "ייצרו לפחות 10 קריאייטיבים מגוונים (זוויות/סגנונות שונים) עם מחולל המודעות.",
    });
  }

  // ── 3. Audience Strategy (weight 0.15) ──
  let audienceScore = 40;
  if (input.hasRemarketingAudience) audienceScore += 30;
  if (input.hasLookalikeAudience) audienceScore += 30;
  audienceScore = Math.min(100, audienceScore);
  if (!input.hasRemarketingAudience) {
    findings.push({
      category: "audience",
      severity: "SUGGESTION",
      title: "אין קהל רימרקטינג",
      detail: "קהל חם (מבקרי אתר/מעורבים) ממיר בעלות נמוכה בהרבה מקהל קר.",
      fix: "צרו קהל רימרקטינג בלשונית 'קהלים' והוסיפו שכבת רימרקטינג לאסטרטגיה.",
    });
  }
  if (!input.hasLookalikeAudience) {
    findings.push({
      category: "audience",
      severity: "INFO",
      title: "אין קהל Lookalike",
      detail: "Lookalike מרחיב הגעה לקהל קר איכותי על בסיס הלקוחות הקיימים.",
      fix: "צרו Lookalike מקהל מקור (מבקרים/לקוחות) בלשונית 'קהלים'.",
    });
  }

  // ── 4. Account Structure (weight 0.10) ──
  // Penalize fragmentation (too many ad sets splitting budget → audience overlap).
  let structureScore = 100;
  for (const c of liveCampaigns) {
    if (c.adSetCount > 4) {
      structureScore -= 15;
      findings.push({
        category: "structure",
        severity: "WARNING",
        title: `הקמפיין "${c.name}" מפוצל ל-${c.adSetCount} קבוצות מודעות`,
        detail: "יותר מדי קבוצות מפצלות את התקציב, מאריכות את שלב הלמידה וגורמות לחפיפת קהלים.",
        fix: "אחדו קבוצות דומות; העדיפו 2–3 קבוצות עם Advantage+ audience.",
      });
    }
  }
  structureScore = Math.max(0, structureScore);

  // ── 5. Budget Sufficiency (weight 0.15) ──
  // A campaign whose daily budget can't reach ~1 result/day struggles to exit learning.
  // (Approximation at campaign level since SMB budgets are usually CBO.)
  let sufficiencyScore = 100;
  const underfunded = liveCampaigns.filter((c) => {
    const m = input.metrics.find((x) => x.entityId === c.id);
    return m && m.daysLive >= 3 && (m.conversions || m.leads) / Math.max(1, m.daysLive) < 0.3;
  });
  if (underfunded.length > 0) {
    sufficiencyScore = Math.max(30, 100 - underfunded.length * 25);
    findings.push({
      category: "budget",
      severity: "WARNING",
      title: `${underfunded.length} קמפיינים עם פחות מ~1 תוצאה ל-3 ימים`,
      detail: "תקציב נמוך מדי ביחס ל-CPA מונע יציאה משלב הלמידה (צריך ~50 תוצאות בשבוע לקבוצה).",
      fix: `העלו תקציב או אחדו קבוצות כדי לעבור ~50 תוצאות/שבוע (יעד CPA ₪${targetCpa}).`,
    });
  }

  // ── 6. Performance Hygiene (weight 0.20) — reuse the kill/scale/refresh rules ──
  const ruleFindings: RuleFinding[] = evaluateRules(input.metrics, { targetCpaIls: targetCpa, cpmP50: 35 });
  const criticalIssues = ruleFindings.filter((f) => f.severity === "CRITICAL").length;
  const warnings = ruleFindings.filter((f) => f.severity === "WARNING").length;
  let hygieneScore = 100 - criticalIssues * 25 - warnings * 10;
  hygieneScore = Math.max(0, hygieneScore);
  for (const rf of ruleFindings.slice(0, 4)) {
    findings.push({
      category: "performance",
      severity: rf.severity,
      title: rf.title,
      detail: rf.body,
      fix: "עברו ללשונית 'המלצות' לפעולה עם שער האישורים.",
    });
  }
  if (input.metrics.length === 0) {
    hygieneScore = 50;
    findings.push({
      category: "performance",
      severity: "INFO",
      title: "אין נתוני ביצועים",
      detail: "לא נמצאו נתוני ביצועים בחלון הבדיקה.",
      fix: "חברו חשבון מודעות ובצעו סנכרון נתונים.",
    });
  }

  const categories: AuditCategory[] = [
    { key: "tracking", label: "מעקב ופיקסל", weight: 0.2, score: trackingScore },
    { key: "creative", label: "מגוון קריאייטיב", weight: 0.2, score: creativeScore },
    { key: "performance", label: "היגיינת ביצועים", weight: 0.2, score: hygieneScore },
    { key: "audience", label: "אסטרטגיית קהלים", weight: 0.15, score: audienceScore },
    { key: "budget", label: "מספיקות תקציב", weight: 0.15, score: sufficiencyScore },
    { key: "structure", label: "מבנה חשבון", weight: 0.1, score: structureScore },
  ];
  const score = Math.round(categories.reduce((sum, c) => sum + c.weight * c.score, 0));

  const sevRank: Record<AuditSeverity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1, INFO: 0 };
  findings.sort((a, b) => sevRank[b.severity] - sevRank[a.severity]);

  return { score, grade: grade(score), categories, findings };
}
