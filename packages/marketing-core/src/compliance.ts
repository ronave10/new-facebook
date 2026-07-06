// Deterministic compliance engine (Layer 1). Hebrew + English keyword/regex rules
// that catch Meta policy violations BEFORE the LLM reviewer. BLOCK findings must
// keep an asset out of Review & Approve. Source: council marketing expert v1
// (rules C1 personal attributes, C2 unrealistic promises, C3 before/after, C4
// restricted verticals IL).

export type ComplianceVerdict = "PASS" | "WARN" | "BLOCK";

export interface ComplianceFinding {
  ruleId: string;
  severity: "WARN" | "BLOCK";
  policyRef: string;
  excerpt: string;
  fix: string;
}

export interface ComplianceResult {
  verdict: ComplianceVerdict;
  findings: ComplianceFinding[];
}

export interface ComplianceContext {
  /** normalized vertical key (see benchmarks.normalizeVertical) */
  vertical?: string | null;
  forbiddenWords?: string[];
  forbiddenPromises?: string[];
}

const SENSITIVE_VERTICALS = new Set(["medical_aesthetics", "dental", "fitness", "beauty", "finance_insurance"]);

// C2 — unrealistic promises / guarantees (BLOCK)
const C2_BLOCK = [
  "מובטח",
  "הבטחה",
  "100% הצלחה",
  "מאה אחוז",
  "ללא סיכון",
  "הכנסה פסיבית מובטחת",
  "תוצאה מובטחת",
  "ריפוי",
  "תרופה ל",
  "guaranteed",
];
// C2 — softer, requires disclaimer (WARN)
const C2_WARN = [/תוצאות תוך \d+/, /תרד(י|ו)? \d+ ?ק(״|")?ג/, /תרוויח.{0,10}₪?\d/];

// C1 — personal attributes: gendered 2nd-person assertion of a sensitive state (BLOCK)
const C1_BLOCK = [
  /אתה סובל מ/,
  /את סובלת מ/,
  /יש לך חוב/,
  /יש לך חובות/,
  /אתה בדיכאון/,
  /את בדיכאון/,
  /החוב שלך/,
  /המשקל שלך/,
];
// C1 — WARN: second-person + sensitive topic co-occurrence
const C1_WARN = [/סובלים מ/, /נמאס לך/];

// C4 — restricted verticals IL that need special handling
const C4_KEYWORDS: { re: RegExp; ref: string; fix: string }[] = [
  { re: /(קריפטו|crypto|ביטקוין|פורקס|forex|מסחר במטבע|אופציות בינאריות)/i, ref: "Meta: Cryptocurrency/CFD", fix: "פרסום קריפטו/פורקס דורש אישור כתוב מ-Meta ורישוי. הסירו או פנו לאישור מראש." },
];

export function checkCompliance(text: string, ctx: ComplianceContext = {}): ComplianceResult {
  const findings: ComplianceFinding[] = [];
  const lower = text.toLowerCase();

  // C1 personal attributes
  for (const re of C1_BLOCK) {
    const m = text.match(re);
    if (m) findings.push({ ruleId: "C1", severity: "BLOCK", policyRef: "Personal attributes", excerpt: m[0], fix: "נסחו בגוף שלישי/כללי: 'אנשים שמתמודדים עם…' במקום פנייה ישירה." });
  }
  for (const re of C1_WARN) {
    const m = text.match(re);
    if (m) findings.push({ ruleId: "C1", severity: "WARN", policyRef: "Personal attributes", excerpt: m[0], fix: "הימנעו מרמיזה למאפיין אישי; שקלו ניסוח כללי." });
  }

  // C2 unrealistic promises
  for (const w of C2_BLOCK) {
    if (lower.includes(w.toLowerCase())) findings.push({ ruleId: "C2", severity: "BLOCK", policyRef: "Unrealistic outcomes", excerpt: w, fix: "הסירו הבטחה מוחלטת. השתמשו ב'עשוי', 'רבים מדווחים', והוסיפו הסתייגות." });
  }
  for (const re of C2_WARN) {
    const m = text.match(re);
    if (m) findings.push({ ruleId: "C2", severity: "WARN", policyRef: "Unrealistic outcomes", excerpt: m[0], fix: "דרוש גיבוי בהוכחות + הסתייגות 'התוצאות משתנות'." });
  }

  // C3 before/after in sensitive verticals
  if (ctx.vertical && SENSITIVE_VERTICALS.has(ctx.vertical)) {
    if (/(לפני\s*[/\\-]?\s*אחרי|before.?after|before\s*\/\s*after)/i.test(text)) {
      findings.push({ ruleId: "C3", severity: "BLOCK", policyRef: "Before/After (sensitive)", excerpt: "לפני/אחרי", fix: "בורטיקל רגיש: החליפו בצילומי תהליך / תמונת 'אחרי' לייף-סטייל / מיצוב סמכות." });
    }
  }

  // C4 restricted verticals
  for (const c of C4_KEYWORDS) {
    const m = text.match(c.re);
    if (m) findings.push({ ruleId: "C4", severity: "BLOCK", policyRef: c.ref, excerpt: m[0], fix: c.fix });
  }

  // Client-defined forbidden words/promises
  for (const w of ctx.forbiddenWords ?? []) {
    if (w && lower.includes(w.toLowerCase())) findings.push({ ruleId: "CLIENT", severity: "BLOCK", policyRef: "Client restriction", excerpt: w, fix: "מילה אסורה לפי הגבלות הלקוח — הסירו." });
  }
  for (const w of ctx.forbiddenPromises ?? []) {
    if (w && lower.includes(w.toLowerCase())) findings.push({ ruleId: "CLIENT", severity: "BLOCK", policyRef: "Client restriction", excerpt: w, fix: "הבטחה אסורה לפי הגבלות הלקוח — הסירו." });
  }

  const verdict: ComplianceVerdict = findings.some((f) => f.severity === "BLOCK")
    ? "BLOCK"
    : findings.length > 0
      ? "WARN"
      : "PASS";
  return { verdict, findings };
}
