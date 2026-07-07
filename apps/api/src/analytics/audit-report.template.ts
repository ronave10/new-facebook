import type { AccountAudit } from "@campaignos/marketing-core";

export interface AuditReportMeta {
  clientName: string;
  industry?: string | null;
  orgName?: string | null;
  generatedAt: Date;
}

const GRADE_COLOR: Record<AccountAudit["grade"], string> = {
  A: "#059669",
  B: "#16a34a",
  C: "#d97706",
  D: "#ea580c",
  F: "#dc2626",
};

const SEV = {
  critical: { label: "קריטי", color: "#dc2626", bg: "#fef2f2" },
  high: { label: "גבוה", color: "#ea580c", bg: "#fff7ed" },
  medium: { label: "בינוני", color: "#d97706", bg: "#fffbeb" },
  low: { label: "נמוך", color: "#0284c7", bg: "#f0f9ff" },
} as const;

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/**
 * Renders the Account Health Audit as a self-contained, print-optimized Hebrew RTL
 * HTML document — a client-ready deliverable. No external assets (CSP-safe, offline);
 * the user saves it as PDF via the browser's print dialog.
 */
export function renderAuditReport(audit: AccountAudit, meta: AuditReportMeta): string {
  const gColor = GRADE_COLOR[audit.grade];
  const circumference = 2 * Math.PI * 52;
  const dash = (audit.score / 100) * circumference;

  const categoriesHtml = audit.categories
    .map((c) => {
      const barColor = c.score >= 70 ? "#16a34a" : c.score >= 50 ? "#d97706" : "#dc2626";
      return `
      <div class="cat">
        <div class="cat-head">
          <span class="cat-label">${esc(c.label)}</span>
          <span class="cat-score" style="color:${barColor}">${c.score}<span class="cat-weight"> · משקל ${Math.round(
            c.weight * 100,
          )}%</span></span>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${c.score}%;background:${barColor}"></div></div>
      </div>`;
    })
    .join("");

  const findingsHtml = audit.findings.length
    ? audit.findings
        .map((f) => {
          const sev = SEV[f.severity as keyof typeof SEV] ?? SEV.low;
          return `
      <div class="finding" style="border-inline-start:4px solid ${sev.color};background:${sev.bg}">
        <div class="finding-head">
          <span class="sev" style="color:${sev.color}">${sev.label}</span>
          <span class="finding-title">${esc(f.title)}</span>
        </div>
        <p class="finding-detail">${esc(f.detail)}</p>
        <p class="finding-fix"><b>המלצה:</b> ${esc(f.fix)}</p>
      </div>`;
        })
        .join("")
    : `<p class="empty">לא נמצאו ממצאים לטיפול — החשבון במצב תקין. 🎉</p>`;

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>דוח ביקורת חשבון — ${esc(meta.clientName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --brand:#4f46e5; }
  body { font-family: "Heebo", "Segoe UI", Arial, sans-serif; color: var(--ink); background:#f1f5f9; line-height:1.6; }
  .page { max-width: 820px; margin: 24px auto; background:#fff; padding: 40px 44px; box-shadow: 0 4px 24px rgba(0,0,0,.06); }
  header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid var(--line); padding-bottom:20px; }
  .brand { font-size:13px; color:var(--brand); font-weight:700; letter-spacing:.02em; }
  h1 { font-size:24px; margin-top:6px; }
  .sub { color:var(--muted); font-size:14px; margin-top:4px; }
  .meta { text-align:end; color:var(--muted); font-size:12px; }
  .hero { display:flex; align-items:center; gap:28px; padding:28px 0; border-bottom:1px solid var(--line); }
  .gauge { position:relative; width:132px; height:132px; flex:none; }
  .gauge .num { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .gauge .score { font-size:34px; font-weight:800; line-height:1; }
  .gauge .of { font-size:11px; color:var(--muted); }
  .grade-box { text-align:center; }
  .grade { font-size:56px; font-weight:800; line-height:1; }
  .grade-cap { font-size:12px; color:var(--muted); }
  .hero-txt { flex:1; }
  .hero-txt h2 { font-size:17px; margin-bottom:6px; }
  .hero-txt p { color:var(--muted); font-size:14px; }
  section { padding:24px 0; border-bottom:1px solid var(--line); }
  section h3 { font-size:15px; margin-bottom:14px; color:var(--ink); }
  .cat { margin-bottom:12px; }
  .cat-head { display:flex; justify-content:space-between; font-size:13px; margin-bottom:5px; }
  .cat-label { font-weight:600; }
  .cat-score { font-weight:700; }
  .cat-weight { color:var(--muted); font-weight:400; font-size:11px; }
  .bar { height:8px; background:#f1f5f9; border-radius:99px; overflow:hidden; }
  .bar-fill { height:100%; border-radius:99px; }
  .finding { padding:12px 14px; border-radius:8px; margin-bottom:10px; }
  .finding-head { display:flex; align-items:center; gap:8px; }
  .sev { font-size:11px; font-weight:700; padding:1px 8px; border-radius:99px; background:#fff; }
  .finding-title { font-weight:700; font-size:14px; }
  .finding-detail { font-size:13px; color:#334155; margin-top:5px; }
  .finding-fix { font-size:13px; color:#334155; margin-top:4px; }
  .empty { color:#16a34a; font-size:14px; }
  footer { padding-top:18px; color:var(--muted); font-size:11px; text-align:center; }
  .toolbar { position:fixed; inset-block-start:16px; inset-inline-start:16px; }
  .btn { background:var(--brand); color:#fff; border:none; padding:10px 18px; border-radius:10px; font-size:14px; font-weight:600; cursor:pointer; box-shadow:0 2px 8px rgba(79,70,229,.3); font-family:inherit; }
  @media print {
    body { background:#fff; }
    .page { box-shadow:none; margin:0; max-width:none; padding:0 12px; }
    .toolbar { display:none; }
    section, .hero { break-inside: avoid; }
    .finding { break-inside: avoid; }
  }
  @page { size: A4; margin: 14mm; }
</style>
</head>
<body>
  <div class="toolbar"><button class="btn" onclick="window.print()">📄 שמור כ-PDF / הדפס</button></div>
  <div class="page">
    <header>
      <div>
        <div class="brand">CampaignOS AI</div>
        <h1>דוח ביקורת חשבון פרסום</h1>
        <div class="sub">${esc(meta.clientName)}${meta.industry ? " · " + esc(meta.industry) : ""}</div>
      </div>
      <div class="meta">
        ${meta.orgName ? `הופק ע״י ${esc(meta.orgName)}<br/>` : ""}
        תאריך: ${fmtDate(meta.generatedAt)}
      </div>
    </header>

    <div class="hero">
      <div class="gauge">
        <svg width="132" height="132" viewBox="0 0 132 132">
          <circle cx="66" cy="66" r="52" fill="none" stroke="#eef2f7" stroke-width="12" />
          <circle cx="66" cy="66" r="52" fill="none" stroke="${gColor}" stroke-width="12"
            stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${circumference.toFixed(1)}"
            transform="rotate(-90 66 66)" />
        </svg>
        <div class="num"><span class="score" style="color:${gColor}">${audit.score}</span><span class="of">מתוך 100</span></div>
      </div>
      <div class="grade-box">
        <div class="grade" style="color:${gColor}">${audit.grade}</div>
        <div class="grade-cap">ציון-אות</div>
      </div>
      <div class="hero-txt">
        <h2>מדד בריאות החשבון</h2>
        <p>ציון משוקלל על פני 6 קטגוריות: מעקב ופיקסל, מגוון קריאייטיב, היגיינת ביצועים, אסטרטגיית קהלים, מספיקות תקציב ומבנה חשבון. ${audit.findings.length} ממצאים אותרו לטיפול.</p>
      </div>
    </div>

    <section>
      <h3>פירוט לפי קטגוריה</h3>
      ${categoriesHtml}
    </section>

    <section>
      <h3>ממצאים והמלצות (${audit.findings.length})</h3>
      ${findingsHtml}
    </section>

    <footer>
      הופק אוטומטית ע״י CampaignOS AI · דוח זה מבוסס על נתוני 14 הימים האחרונים · ${fmtDate(meta.generatedAt)}
    </footer>
  </div>
</body>
</html>`;
}
