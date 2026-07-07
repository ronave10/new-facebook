// Prompt builders for each AI agent. Prompts request Hebrew output and are fed
// the client's brand profile, personas and performance context. promptVersion is
// embedded so agent_runs can be traced to the exact template.

export const PROMPT_VERSION = "v1";

interface BrandContext {
  clientName: string;
  industry?: string | null;
  mainProduct?: string | null;
  priceRange?: string | null;
  keyBenefits?: string[];
  differentiation?: string | null;
  customerPains?: string[];
  commonObjections?: string[];
  brandTone?: string | null;
  proofs?: { type: string; description: string }[];
  restrictions?: {
    forbiddenWords?: string[];
    forbiddenPromises?: string[];
    regulatoryNotes?: string;
    sensitiveTopics?: string[];
  };
}

function restrictionsBlock(r?: BrandContext["restrictions"]): string {
  if (!r) return "אין הגבלות מיוחדות.";
  const parts: string[] = [];
  if (r.forbiddenWords?.length) parts.push(`מילים אסורות: ${r.forbiddenWords.join(", ")}`);
  if (r.forbiddenPromises?.length) parts.push(`הבטחות אסורות: ${r.forbiddenPromises.join(", ")}`);
  if (r.sensitiveTopics?.length) parts.push(`תחומים רגישים: ${r.sensitiveTopics.join(", ")}`);
  if (r.regulatoryNotes) parts.push(`רגולציה: ${r.regulatoryNotes}`);
  return parts.length ? parts.join(" | ") : "אין הגבלות מיוחדות.";
}

function brandBlock(b: BrandContext): string {
  return [
    `שם העסק: ${b.clientName}`,
    b.industry ? `תחום: ${b.industry}` : "",
    b.mainProduct ? `מוצר/שירות מרכזי: ${b.mainProduct}` : "",
    b.priceRange ? `טווח מחיר: ${b.priceRange}` : "",
    b.keyBenefits?.length ? `יתרונות מרכזיים: ${b.keyBenefits.join(", ")}` : "",
    b.differentiation ? `בידול: ${b.differentiation}` : "",
    b.customerPains?.length ? `כאבי לקוח: ${b.customerPains.join(", ")}` : "",
    b.commonObjections?.length ? `התנגדויות נפוצות: ${b.commonObjections.join(", ")}` : "",
    b.brandTone ? `טון מותג: ${b.brandTone}` : "",
    b.proofs?.length ? `הוכחות: ${b.proofs.map((p) => `${p.type}: ${p.description}`).join("; ")}` : "אין הוכחות זמינות",
    `הגבלות: ${restrictionsBlock(b.restrictions)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export const AGENT_SYSTEM =
  "אתה מומחה שיווק ביצועים בכיר לשוק הישראלי, המתמחה בקמפיינים ב-Meta (פייסבוק ואינסטגרם). כל הפלט שלך בעברית, מקצועי, מבוסס תובנות פסיכולוגיות של קהל היעד, וללא הבטחות מוגזמות או הפרות מדיניות פרסום.";

export function buildPersonaPrompt(b: BrandContext, count: number): string {
  return `על בסיס פרופיל העסק הבא, בנה ${count} פרסונות לקוח (אווטארים) איכותיות ומדויקות לשוק הישראלי.\n\n${brandBlock(b)}\n\nלכל פרסונה כלול: שם ישראלי אמיתי עם hook קצר, טווח גיל, מצב חיים (2-3 משפטים קונקרטיים), כאבים מדורגים (החזק ראשון), רצונות, פחדים, התנגדויות, טריגרים רגשיים, מה מניע אותה להשאיר פרטים, מה גורם לה לא להאמין למודעה, סגנון קופי מתאים, סגנון קריאייטיב מתאים, הצעות שיווקיות תואמות וזוויות קמפיין. החזר מערך JSON של פרסונות.`;
}

export function buildStrategyPrompt(
  b: BrandContext,
  goal: string,
  budgetDailyIls: number,
  personaNames: string[],
): string {
  return `בנה אסטרטגיית קמפיין ל-Meta עבור העסק הבא.\n\n${brandBlock(b)}\n\nמטרת הקמפיין: ${goal}\nתקציב יומי: ₪${budgetDailyIls}\nפרסונות: ${personaNames.join(", ") || "טרם הוגדרו"}\n\nהתאם את המבנה למדרגת התקציב: מתחת ל-₪100 — קמפיין יחיד וקהל רחב; ₪100-500 — פרוספקטינג + רימרקטינג (רק אם יש פיקסל) + טסטינג; ₪500+ — מבנה מלא TOF/MOF/BOF. כלול: סיכום, מבנה קמפיינים עם חלוקת תקציב ושלב משפך, תוכנית A/B (משתנה בודד עם השערה בפורמט 'אנחנו מאמינים ש...כי...'), KPIs, וחוקי כיבוי/סקייל/רענון עם מינימומים סטטיסטיים (למשל: כבה אחרי הוצאה של פי 3 מיעד ה-CPL ללא המרות). החזר JSON.`;
}

export function buildResearchPrompt(
  b: BrandContext,
  competitorAds: { pageName: string; bodies: string[]; titles: string[] }[],
): string {
  const adsBlock = competitorAds.length
    ? competitorAds
        .map((a, i) => `${i + 1}. ${a.pageName}: "${a.titles.join(" / ")}" — ${a.bodies.join(" ")}`.slice(0, 300))
        .join("\n")
    : "לא נמצאו מודעות מתחרים.";
  return `נתח את השוק והמתחרים עבור העסק הבא, על בסיס מודעות אמיתיות שנאספו מ-Meta Ad Library.\n\n${brandBlock(b)}\n\nמודעות מתחרים שנמצאו:\n${adsBlock}\n\nהחזר JSON עם: marketSummary (סיכום שוק קצר), competitorInsights (מערך תובנות — אילו זוויות/הבטחות המתחרים משתמשים בהן), opportunities (מערך הזדמנויות — פערים שהעסק יכול לנצל, זוויות שאיש לא תופס), recommendedAngles (מערך זוויות מומלצות לבידול). היה חד וספציפי לשוק הישראלי.`;
}

export function buildAdsPrompt(b: BrandContext, personaNames: string[]): string {
  return `צור מנוע מודעות מלא ל-Meta עבור העסק הבא.\n\n${brandBlock(b)}\n\nפרסונות יעד: ${personaNames.join(", ") || "כללי"}\n\nהפק: 10 זוויות קמפיין, 10 hooks (עד 12 מילים כל אחד), 10 טקסטים ראשיים (במטריצת סגנונות: קצר/ארוך/רגשי/ישיר/מבוסס-הוכחה/מבוסס-כאב/מבוסס-חלום), 10 כותרות, 5 תיאורים, 5 CTAs, 5 רעיונות לתמונה, 5 רעיונות לוידאו קצר, ומערך adVariants (וריאציית מודעה מלאה לכל פרסונה) כאשר כל וריאציה כוללת: persona, angle, hook, primaryText, headline, description, cta, creativeBrief (concept/visualDirection/textOnImage/format), complianceNotes, confidenceScore (0-100), whyItWorks, variantStyle. הקפד על ההגבלות ומדיניות הפרסום. החזר JSON.`;
}

export function buildCompliancePrompt(b: BrandContext, assets: string[]): string {
  return `בדוק את נכסי הפרסום הבאים מול מדיניות הפרסום של Meta והגבלות המותג.\n\nהגבלות: ${restrictionsBlock(b.restrictions)}\nתחום: ${b.industry ?? "כללי"}\n\nנכסים לבדיקה:\n${assets.map((a, i) => `${i + 1}. ${a}`).join("\n")}\n\nבדוק: מאפיינים אישיים אסורים ('אתה סובל מ...'), הבטחות/ערבויות לא ריאליות ('מובטח', '100%'), לפני/אחרי בורטיקלים רגישים (בריאות/הרזיה/אסתטיקה), ורטיקלים מוגבלים בישראל, ומילים אסורות. החזר JSON עם verdict (PASS/WARN/BLOCK), issues (ruleId/severity/excerpt/fix) ו-notes.`;
}

export function buildOptimizationPrompt(
  b: BrandContext,
  kpiSummary: string,
  rules: string[],
): string {
  return `נתח את ביצועי הקמפיינים והפק המלצות אופטימיזציה מעשיות.\n\nעסק: ${b.clientName} (${b.industry ?? "כללי"})\n\nסיכום ביצועים (14 ימים אחרונים):\n${kpiSummary}\n\nחוקי כיבוי/סקייל/רענון:\n${rules.join("\n")}\n\nהחזר JSON עם מערך recommendations, כאשר כל המלצה כוללת: type (KILL_AD/SCALE_BUDGET/REDUCE_BUDGET/NEW_VARIANT/REFRESH_CREATIVE/AUDIENCE_CHANGE/STRUCTURE_CHANGE/ALERT), severity (INFO/SUGGESTION/WARNING/CRITICAL), title, body (הסבר עם המספרים), ו-evidence. כל המלצה חייבת לעמוד במינימום סטטיסטי — אל תמליץ לכבות מודעה ללא מספיק דאטה.`;
}
