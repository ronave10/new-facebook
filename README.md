# CampaignOS AI

מערכת SaaS רב-דיירית (multi-tenant) לניהול קמפיינים ב-Meta (Facebook/Instagram) עבור לקוחות סוכנות — מקצה לקצה: **לקוח → עסק → הצעה → אווטאר → אסטרטגיה → מודעות → אישור → פרסום → נתונים → שיפור → סקייל.**
ממשק בעברית מלאה (RTL). מיועד לסוכנויות, נותני שירות, עסקים קטנים-בינוניים ויועצי שיווק.

> **עקרון מנחה:** שום דבר לא עולה לאוויר ב-Meta בלי אישור אנושי מפורש. כל כתיבה עוברת מסך **Review & Approve** שמציג את ה-payload המדויק שיישלח.

---

## ✨ יכולות

- **Multi-tenant SaaS** — הפרדת דיירים מלאה, תפקידים (מנהל מערכת / בעל סוכנות / מנהל תיקים / צפייה בלבד), Audit Log לכל פעולה רגישה.
- **אשף לקוח חדש** (5 שלבים) — פרטי עסק, מטרה והצעה, בידול וכאבים, הוכחות וטון, הגבלות.
- **בניית פרסונות ב-AI** — 3–5 אווטארים עם כאבים, רצונות, פחדים, התנגדויות, טריגרים, סגנון קופי/קריאייטיב וזוויות קמפיין.
- **חיבור Meta Ads** — OAuth (Facebook Login for Business) / MCP / Mock, אחסון טוקנים מוצפן (AES-256-GCM), בחירת חשבון מודעות, זרימת reconnect.
- **משיכת נתונים** — קמפיינים, ad sets, מודעות, קריאייטיבים, spend/impressions/reach/clicks/CTR/CPC/CPM/leads/CPA/CPL/ROAS, סדרות זמן.
- **מנוע מודעות AI** — 10 זוויות, hooks, טקסטים ראשיים, כותרות, תיאורים, CTAs, רעיונות לתמונה/וידאו, וריאציות לכל פרסונה (קצר/ארוך/רגשי/ישיר/הוכחה/כאב/חלום) עם ציון ביטחון והערות תאימות.
- **אסטרטגיית קמפיין** — מבנה, חלוקת תקציב, TOF/MOF/BOF, A/B, KPIs, חוקי כיבוי/סקייל/רענון.
- **דאשבורד ביצועים** — הוצאות, תוצאות, CPL/CPA/CTR/CPC/CPM, קמפיינים מובילים/חלשים, מגמות, המלצות AI, "מה לעשות עכשיו".
- **10 סוכני AI** — Research, Persona, Strategy, Copy, Creative, MetaAPI, Analytics, Optimization, Compliance, Approval.
- **קליטת לידים (Lead Ads)** — webhook מאומת-HMAC שקולט לידים מטופסי Meta בזמן אמת לתיבת לידים עם ניהול סטטוס. **ה-PII (שם/אימייל/טלפון) מוצפן ב-AES-256-GCM ב-DB** — לעולם לא בטקסט גלוי — ומפוענח רק בקריאה מורשית.
- **מחיקת מידע (Meta Data Deletion + Deauthorize Callbacks)** — endpoints ציבוריים שמאמתים `signed_request` (HMAC-SHA256 עם app secret), מוחקים את הלידים של המשתמש, ומחזירים `{url, confirmation_code}` עם endpoint סטטוס — כנדרש ב-Platform Terms.
- **מנוע שיווק דטרמיניסטי** — טבלאות KPI לשוק הישראלי, מדרגות תקציב, חוקי Kill/Scale/Refresh ומנוע תאימות כפונקציות בדוקות.
- **לולאת אופטימיזציה** — המלצת סקייל → "החל" → אישור תקציב → ביצוע ב-Meta, תחת אותו שער בטיחות.
- **מילוי מותג אוטומטי (Magic Fill)** — הדבקת כתובת אתר → משיכת תוכן בצד-שרת (מוגן SSRF) → סוכן AI ממלא אוטומטית פרופיל מותג ראשוני באשף הלקוח החדש.
- **חיפוש תחומי עניין לטירגוט** — חיפוש חי בטקסונומיית ה-Detailed Targeting של Meta עם הערכת גודל קהל, בורר תחומי עניין המוזרם לטיוטת הקמפיין.
- **בדיקת מובהקות A/B** — מבחן z לשתי פרופורציות על יחס ההמרה בין וריאציות הקמפיין: מנצח, p-value, ביטחון, שיפור יחסי, רווחי סמך (Wilson) לכל וריאציה ולהפרש, תחזית "כמה ימים עד הכרעה" לפי קצב התנועה, ובחירת כל שתי וריאציות להשוואה — מנוע דטרמיניסטי בדוק ב-marketing-core.
- **הרצת A/B חיה (Meta Experiments)** — רישום מבחן פיצול על הקמפיין, השקה חיה ל-Meta **מאחורי שער האישור** (maker-checker, ביצוע `createSplitTest` רק לאחר אישור, כתיבה מתועדת ומאובטחת מפני drift), ומשיכת תוצאות חיות + חישוב מובהקות אוטומטי.
- **מחקר מתחרים** — איסוף מודעות אמיתיות מ-Meta Ad Library וניתוח AI לזוויות, הבטחות והזדמנויות בידול.
- **קהלים מותאמים ו-Lookalikes** — סנכרון, יצירה ומחיקה של Custom Audiences (כל כתיבה מתועדת ב-Audit Log).
- **ציון בריאות חשבון (0–100)** — ביקורת אוטומטית ב-6 קטגוריות (טראקינג, גיוון קריאייטיב, היגיינת ביצועים, אסטרטגיית קהל, תקציב, מבנה) עם ציון, ציון-אות וממצאים מדורגים.
- **דוח ביקורת להורדה** — הפקת דוח HTML עצמאי, ממותג, מותאם-הדפסה (RTL, A4) מציון בריאות החשבון — תוצר מוכן-ללקוח שנשמר כ-PDF מהדפדפן.

---

## 🏗️ ארכיטקטורה

מונו-רפו (pnpm workspaces):

```
apps/
  api/    NestJS 11 — כל הלוגיקה העסקית וה-DB (guards, services, agents, workers)
  web/    Next.js 15 App Router — לקוח דק בעברית RTL
packages/
  db/       Prisma schema (27 טבלאות) + client + seed
  shared/   zod schemas, enums, מטריצת RBAC, תוויות עברית, טיפוסי API
  meta/     MetaConnector abstraction + 3 מימושים (mock / marketing-api / mcp)
  ai/       AiProvider abstraction (anthropic / mock)
```

**Stack:** Next.js + React 19 + Tailwind (RTL) · NestJS + TypeScript · PostgreSQL + Prisma · BullMQ (Redis) עם fallback in-process · S3-compatible (MinIO) · Anthropic Claude.

מסמכי עומק: [`docs/DESIGN.md`](docs/DESIGN.md) (תוכנית העבודה המלאה), [`docs/BUILD_CONTRACT.md`](docs/BUILD_CONTRACT.md) (חוזה ה-API), [`docs/META_MCP_TOOLS.md`](docs/META_MCP_TOOLS.md), [`docs/council-summary.md`](docs/council-summary.md).

---

## 🚀 הרצה מקומית

### דרישות
- Node.js ≥ 20, pnpm ≥ 10
- PostgreSQL (או `docker compose up -d postgres redis minio`)

### שלבים

```bash
# 1. התקנה
pnpm install

# 2. משתני סביבה
cp .env.example .env
# צרו מפתחות: openssl rand -hex 32  →  JWT_ACCESS_SECRET / JWT_REFRESH_SECRET / CREDENTIALS_ENCRYPTION_KEY

# 3. מסד נתונים (דורש Postgres רץ)
pnpm db:up            # אופציונלי: מריץ postgres+redis+minio בדוקר
pnpm db:migrate       # יוצר את הסכימה
pnpm db:seed          # נתוני דמו

# 4. הרצה (API על :4000, Web על :3000)
pnpm dev
```

פתחו http://localhost:3000 והתחברו עם חשבון הדמו:

| משתמש | סיסמה | תפקיד |
|---|---|---|
| `owner@demo.co.il` | `Demo1234!` | בעל סוכנות |
| `manager@demo.co.il` | `Demo1234!` | מנהל תיקים |

### מצב דמו ללא תשתית חיצונית
- **`META_MODE=mock`** — מדמה חשבונות מודעות, עמודים, פיקסלים, קמפיינים ו-insights ללא אפליקציית Meta אמיתית. ניתן לעבור את כל הזרימה כולל "פרסום".
- **`AI_PROVIDER=mock`** — מחזיר פרסונות/אסטרטגיה/מודעות בעברית ללא מפתח API.
- **`REDIS_URL=` (ריק)** — התורים רצים in-process ללא Redis.

לשימוש אמיתי: הגדירו `META_MODE=marketing-api` + פרטי אפליקציית Meta, ו-`AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`.

---

## 🔒 בטיחות ופרטיות

- טוקנים **ו-PII של לידים** מוצפנים ב-AES-256-GCM (לעולם לא בטקסט גלוי); Data Deletion + Deauthorize callbacks מאומתי-signed_request למחיקת מידע לפי דרישה.
- אין פרסום קמפיין בלי Approval מאושר; publish מאמת שה-payload לא השתנה מאז האישור (hash drift → 409).
- יצירה ב-Meta תמיד במצב **PAUSED**, הפעלה רק לאחר אישור (top-down).
- Maker-checker: מי שביקש אישור אינו יכול לאשר בעצמו כשקיים מאשר אחר.
- בידוד דיירים בכל שאילתה; audit log immutable; לוג לכל קריאת AI ו-Meta עם hash.
- Rate limiting, מיפוי שגיאות Meta להודעות עברית, reconnect flow.

---

## 🧪 בדיקות

```bash
pnpm test          # כל החבילות
pnpm typecheck     # בדיקת טיפוסים
```

מכוסה: parity של mock connector + invariant של PAUSED, מיפוי שגיאות Graph, סכימת פלט AI, הצפנה round-trip + tamper, OAuth state (חתימה/זיוף/תפוגה), אימות סיסמאות (argon2 + scrypt), תוכנית publish דטרמיניסטית (PAUSED-first).

זרימה מלאה שנבדקה חיה: התחברות → אשף לקוח → פרסונות AI → חיבור Meta → בחירת חשבון → טיוטת קמפיין → אסטרטגיה+מודעות AI → publish-ללא-אישור מחזיר 409 → אישור → פרסום (PAUSED ואז activate) → סנכרון → אנליטיקס; בידוד דיירים מחזיר 404; ACCOUNT_MANAGER מנוע מאישור (403).

---

## 📁 API עיקרי (`/api/v1`)

`auth/*` · `org` + `org/members` + `audit-logs` · `clients/*` + `brand-profile` + `personas/generate` · `meta/connect/*` + `ad-accounts` + `sync` + `insights` · `campaigns/*` + `generate-strategy` + `generate-ads` + `request-approval` + `publish` · `approvals/*` · `analytics/client/:id` + `recommendations/*`.

פירוט מלא ב-[`docs/BUILD_CONTRACT.md`](docs/BUILD_CONTRACT.md).

---

## 🗺️ מפת דרכים

Foundation ✅ · Client Builder ✅ · Meta Connection ✅ · Campaign AI ✅ · Publish & Sync ✅ · Optimization ✅ · Frontend (19 מסכים) ✅
