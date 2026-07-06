# CampaignOS AI — תוכנית העבודה והארכיטקטורה (Design & Work Plan)

> מסמך זה הוא סינתזה של "מועצת המומחים" (8 מומחים: ארכיטקטורה, Meta API, מוצר, שיווק ביצועים, UX/UI, אבטחה, DevOps, QA).
> הוא המקור הסמכותי לבנייה. כל סתירה בין מומחים הוכרעה בסעיף [הכרעות](#conflicts).

---

## 0. ניתוח קצר של הפרויקט

CampaignOS AI היא פלטפורמת SaaS רב-דיירית (multi-tenant) שמלווה סוכנות/יועץ שיווק מקצה-לקצה בניהול קמפיינים ב-Meta עבור לקוחות:
**לקוח → עסק → הצעה → אווטאר → אסטרטגיה → מודעות → אישור → פרסום → נתונים → שיפור → סקייל.**

מאפיינים מהותיים שמעצבים כל החלטה:
1. **בטיחות לפני הכל** — שום דבר לא עולה לאוויר בלי אישור אנושי מפורש; כל כתיבה ל-Meta עוברת Review & Approve שמציג את ה-payload המדויק.
2. **בידוד דיירים מוחלט** — לקוח א' לעולם לא רואה נתוני לקוח ב'; נאכף במספר שכבות, לא בקונבנציה.
3. **עברית RTL** — ממשק מלא בעברית מימין-לשמאל, כולל טרמינולוגיה שיווקית ישראלית.
4. **AI כמנוע מרכזי** — 10 סוכנים פנימיים שכל אחד מקבל input מובנה ומחזיר JSON מאומת בסכימה.
5. **דמו ללא תשתית** — חייב לרוץ גם בלי Postgres/Redis/Meta אמיתיים (mock connectors, in-process queue).

---

## 1. שאלות קריטיות — והכרעות ברירת מחדל

אף שאלה אינה חוסמת התקדמות. ההחלטות הבאות התקבלו כברירת מחדל סבירה (ניתנות לשינוי בהגדרות):

| נושא | ברירת מחדל שנבחרה |
|---|---|
| ספק Auth | עצמאי (email+password, argon2id) — ללא תלות בשירות חיצוני שיחסום דמו |
| מסד נתונים לדמו | PostgreSQL אמיתי; fallback: אותה סכימה מול Postgres מקומי/דוקר. `META_MODE=mock` + in-process queue מאפשרים דמו מלא בלי Meta/Redis |
| ספק AI | Anthropic (Claude); mock provider לפיתוח. שכבת `AiProvider` מאפשרת החלפה |
| שיטת חיבור Meta | Facebook Login for Business (OAuth) + `McpMetaConnector` כאשר קיים MCP; fallback ל-Marketing API v23.0 |
| מטבע/שוק ברירת מחדל | ILS, ישראל, עברית |
| מודל תמחור מוצר | לא נכלל ב-MVP (org.plan קיים בסכימה לעתיד) |

---

## 2. ארכיטקטורה

### מבנה מונו-רפו (pnpm workspaces)
```
apps/
  api/    NestJS 11 — כל הלוגיקה העסקית וה-DB. Workers רצים כאן.
  web/    Next.js 15 App Router — לקוח דק, RTL. אין גישה ישירה ל-DB.
packages/
  db/       Prisma schema + client (27 טבלאות) + seed
  shared/   zod schemas, enums, RBAC matrix, תוויות עברית, טיפוסי API — מקור אמת יחיד
  meta/     MetaConnector abstraction + 3 מימושים (mock / marketing-api / mcp) + error taxonomy
  ai/       AiProvider abstraction (anthropic / mock)
```

**הכרעה מרכזית:** NestJS מחזיק 100% מהלוגיקה העסקית וגישת ה-DB. Next.js הוא לקוח דק בלבד (fetch מול `NEXT_PUBLIC_API_URL`). כך יש נקודת אכיפה **אחת** ל-tenant isolation, RBAC, audit ו-approval gates. שני נתיבי כתיבה = דליפה מובטחת.

### כיווניות תלות
`web → shared`  •  `api → {db, shared, meta, ai}`  •  `meta → shared`  •  `ai → shared`
אף חבילה לא תלויה ב-`api`. `shared` היא עלה (leaf) — נצרכת גם ב-web וגם ב-api.

### בידוד דיירים — 3 שכבות (defense in depth)
1. **זהות**: `organizationId` יושב ב-JWT החתום (claim `orgId`), לעולם לא נלקח מ-body/URL. DTOs מסירים orgId נכנס.
2. **הקשר בקשה**: `JwtAuthGuard` → `AuthContext {userId, orgId, role, clientScope}` זמין ב-`@CurrentUser()`. Workers מזריקים orgId ל-job payload.
3. **שאילתות scoped**: כל שירות מסנן ב-`organizationId` מה-AuthContext. מפתחות ייחודיים מורכבים כוללים orgId. שאילתה חוצת-דייר מותרת רק בזרימת auth (login by email) ובג'ובים שמריצים org מפורש.

### טיפול בשגיאות ו-Validation
- **zod** הוא מקור האמת היחיד ל-validation. אותה סכימה מאמתת: טופס ה-wizard ב-web, ה-HTTP body ב-api, ופלט ה-LLM. `ZodValidationPipe` בשרת, `GlobalExceptionFilter` מחזיר `{statusCode, message, code, details}` עם הודעות עברית.
- `MetaApiError` ממופה לקוד משתמש עברי (ראה packages/meta/src/types.ts).

### תורים (Queues)
`QueueService` עם שני דרייברים: **BullMQ** כאשר `REDIS_URL` מוגדר, אחרת **in-process** (setTimeout). תורים: `meta-sync`, `agent-runs`, `insights-refresh`, `meta-publish`. אותו קוד processor רץ בשני הדרייברים — נתיב הדמו מפעיל את הקוד האמיתי.

---

## 3. Database Schema (27 טבלאות)

מיושם במלואו ב-`packages/db/prisma/schema.prisma`. קבוצות עיקריות:

- **זהות ודיירות**: `users`, `organizations`, `organization_members` (role + clientScope), `refresh_tokens`, `api_tokens`
- **לקוחות ומותג**: `clients`, `client_brand_profiles`, `customer_personas`, `offers`, `competitors`
- **חיבור Meta**: `encrypted_credentials` (AES-256-GCM: ciphertext/iv/authTag/keyVersion), `meta_connections`, `meta_ad_accounts`, `meta_pages`, `meta_pixels`
- **קמפיינים**: `campaigns`, `campaign_strategies`, `ad_sets`, `ads`, `ad_creatives`, `creative_assets`, `generated_copy_variants`
- **בטיחות ואנליטיקה**: `approvals` (payloadPreview + payloadHash), `performance_snapshots`, `optimization_recommendations`
- **תצפית**: `agent_runs` (inputHash/outputHash/tokens), `audit_logs` (immutable), `meta_api_call_logs`, `webhooks`, `background_jobs`

עקרונות: כסף ביחידות מינימום (agorot) כ-integer; מפתחות ייחודיים מורכבים עם orgId; audit לא נמחק/מתעדכן ע"י קוד אפליקציה.

---

## 4. API Design (prefix `/api/v1`)

מפורט מלא ב-[docs/BUILD_CONTRACT.md](./BUILD_CONTRACT.md). תמצית לפי מודול:

- **auth**: register (יוצר user+org+membership AGENCY_OWNER), login, refresh (rotation), logout, me. JWT access 15m + refresh 7d מסובב.
- **org**: org read/update, members CRUD (הגנת "בעלים אחרון"), `GET /audit-logs`.
- **clients**: CRUD + wizard, `/brand-profile` (upsert), `/personas/generate`, offers, competitors. אכיפת clientScope ל-CLIENT_VIEWER.
- **meta**: `/connect/start`, `/connect/callback`, connections, ad-accounts select, campaigns, `/sync/:clientId`, insights. כל קריאה נרשמת ל-`meta_api_call_logs`.
- **campaigns**: draft CRUD, `/generate-strategy`, `/generate-ads`, `/request-approval`, `/approve`+`/reject` (maker-checker), `/publish` (PAUSED-first + activate), `/pause`.
- **analytics**: `/analytics/client/:id` (DashboardOverview), timeseries, `/recommendations/generate` + list + decide.
- **agents**: `GET /agent-runs`.

---

## 5. Folder Structure (apps/api)
```
src/
  core/        config, prisma.service, crypto.service, audit.service, queue.service,
               guards (jwt-auth, permissions, rate-limit), zod-validation.pipe,
               global-exception.filter, auth-context, api-error
  auth/        auth.{module,controller,service}, password.util, dto
  org/         org.{module,controller,service}, dto
  clients/     clients.*, personas.*, offers-competitors.*, dto
  meta/        meta.*, connector.factory, oauth-state.util, meta-call-logger.service, sync.service, dto
  campaigns/   campaigns.*, approvals.*, publish.service, payload-builder, generation.service, dto
  agents/      agent-engine.service, ai-provider.factory, agents.controller, prompts/*
  analytics/   analytics.*, recommendations.*, dto
  health.controller, app.module, main
```

---

## 6. UI — עיצוב ומסכים (עברית RTL)

### אסטרטגיית RTL
`<html lang="he" dir="rtl">`, פונט **Heebo** (Google, subsets hebrew+latin). **רק** utilities לוגיים: `ms-/me-/ps-/pe-/start-/end-`. אסור physical (`ml/mr/pl/pr`). גרפים (recharts) עטופים ב-`<div dir="ltr">` עם formatters עבריים; מזהים/URLs/JSON ב-`<span dir="ltr">`; תוכן AI ב-`dir="auto"`.

### מערכת עיצוב (hex מדויק)
- **Primary (indigo)**: 600 `#4F46E5`, 700 `#4338CA`, 100 `#E0E7FF`, 50 `#EEF2FF`
- **Sidebar כהה**: bg `#0F172A`, hover `#1E293B`, active indicator `#6366F1`, text `#94A3B8`/active `#F8FAFC`
- **משטחים**: app-bg `#F8FAFC`, surface `#FFFFFF`, border `#E2E8F0`, text `#0F172A`/`#475569`/`#94A3B8`
- **סמנטי**: success `#16A34A`, warning `#D97706`, danger `#DC2626`, info `#0284C7`
- **Data-viz** (colorblind-safe): `#4F46E5,#0EA5E9,#F59E0B,#10B981,#EC4899,#8B5CF6`. spend תמיד `#4F46E5`, conversions תמיד `#10B981`.
- **Meta-reserved** `#1877F2`: רק בכפתור "התחברו ל-Meta" ותגי חיבור.
- ריווח בסיס 4px; sidebar 264px; topbar 64px; card padding 24; row 52px.

### תפריט צד (סדר עברי)
לוח בקרה · לקוחות · קמפיינים · אישורים · אנליטיקס · המלצות · פעילות · הגדרות
(במצב "לקוח נבחר" נחשפים: סקירת לקוח, פרופיל מותג, פרסונות, חיבור Meta, קמפיינים)

### 19 המסכים
Login/Register · Agency Dashboard · Clients list · Create Client Wizard (5 שלבים) · Client Profile · Brand Profile · Persona Builder · Meta Connection · Ad Account Selector · Campaign Builder · AI Ad Generator · Creative Brief Generator · Review & Approve · Campaign Launch Center · Analytics Dashboard · Recommendations · Settings · Team & Permissions · Activity Log.

### Create Client Wizard — 5 שלבים (autosave לכל שלב)
1. **פרטי העסק** (חובה ליצירה): שם, תחום (~30 ורטיקלים IL), אתר, אזור שירות, שפה, מטבע, מדינה
2. **מטרה והצעה**: מטרת קמפיין (card picker), מוצר/שירות, טווח מחיר, הצעות
3. **מותג ובידול**: יתרונות (chips), בידול, טון מותג, מתחרים
4. **כאבים והתנגדויות**: כאבי לקוח סופי, התנגדויות נפוצות, הוכחות (סוג+טקסט)
5. **הגבלות וסיכום**: מילים אסורות, הבטחות אסורות, רגולציה, סקירה

### Review & Approve — חוזה ה-UX (הנתיב היחיד לכתיבה ל-Meta)
1. **סיכום אנושי**: שם, objective, לקוח, ad account, Page/IG, לו"ז, **תקציב יומי בגדול + תחזית חודשית** ("₪250/יום ≈ ₪7,600/חודש"), ספירת ad sets/ads, סיכום targeting.
2. **עץ ישויות**: Campaign → Ad Sets → Ads. כל מודעה עם תצוגה מקדימה בסגנון פיד + תג פרסונה + תג תאימות.
3. **Payload מדויק** (חובה, לא debug): מציג את רשימת קריאות ה-API המדויקת שתישלח, מסודרת, `<pre dir="ltr">`. טוקנים לעולם לא מופיעים ב-payload.
4. אישור/דחייה עם ConfirmDialog; פרסום דורש הקלדת "אישור".

---

## 7. עיצוב הסוכנים (Agent Pipeline)

`AgentEngine.run({agentType, orgId, clientId, input, schema, system, prompt, taskKey})`:
מאמת input → בונה prompt → `AiProvider.complete` (עד 2 retries על JSON לא תקין) → שומר `agent_runs` (status, inputHash/outputHash SHA-256, model, tokens) → מחזיר `{data, runId}`.

10 סוכנים, כל אחד input מובנה → JSON מאומת:
`Research` · `Persona` · `Strategy` · `Copy` · `Creative` · `MetaAPI` · `Analytics` · `Optimization` · `Compliance` · `Approval`.
Prompts הם קבצי TS מגורסים (`prompts/*.ts`) עם promptVersion.

---

## 8. לוגיקת שיווק (הבידול האמיתי של המוצר)

### בניית פרסונות
מיפוי שדות wizard → 3–5 פרסונות עבריות buy-ready: שם ישראלי אמיתי + hook, טווח גיל, מגדר, מצב חיים (2–3 משפטים), כאבים מדורגים, רצונות, פחדים, התנגדויות, טריגרים רגשיים, מה מניע השארת פרטים, מה גורם לחוסר אמון, סגנון קופי מתאים, סגנון קריאייטיב, הצעות תואמות, זוויות קמפיין.

### מטריצת יצירת מודעות (גרף, לא רשימות)
הכל תלוי ב-**Angles**. 10 זוויות מוקצות בנוסחה: 3 pain-led, 2 dream, 2 proof (רק אם יש הוכחות), 1 objection-crusher, 1 offer-led, 1 curiosity. כל זווית מייצרת ≥1 hook (≤12 מילים). 10 primary texts במטריצת סגנונות קשיחה (2 short, 2 long, emotional, direct, proof, pain, dream, objection). ואז headlines, descriptions, CTAs, image/video ideas, ו-3 וריאציות מודעה לכל פרסונה. כל מודעה: persona, angle, hook, primary, headline, description, CTA, creative brief, compliance notes, confidence score, "למה זה יעבוד".

### אסטרטגיה — מדרגות תקציב (ILS/יום, דטרמיניסטי; ה-LLM כותב רק שמות ורציונל)
- **Tier A (<₪100)**: קמפיין 1, ad set 1, Advantage+ audience, 3 מודעות. בלי שכבת רימרקטינג נפרדת.
- **Tier B (₪100–500)**: Prospecting 65–75% (2 ad sets) + Remarketing 15–25% (רק אם ה-pixel gate עובר) + Testing 10–15%.
- **Tier C (₪500+)**: מבנה מלא TOF/MOF/BOF + LAL tiers.
- **Audience gates**: רימרקטינג רק אם `siteVisitors30d>0 || engagers>0`; LAL רק אם `customerList≥100 || purchases90d≥100`.

### KPI Benchmarks — שוק ישראלי (seed ל-benchmark table, p25/p50/p75 ₪)
- CPL לפי ורטיקל (instant form): שיפוצים 25/45/80 · פיטנס 15/30/55 · אסתטיקה רפואית/שיניים 40/80/150 · נדל"ן 60/120/250 · עו"ד 50/100/200 · פיננסים 60/110/220 · קורסים 25/50/90 · B2B 80/160/320.
- CPM כללי (Leads): 20/35/55. CTR (link) יעד ≥1%.
p75 = סף התראה.

### חוקי Kill/Scale/Refresh (פונקציות דטרמיניסטיות; שום דבר לא אוטומטי — רק המלצה)
**מינימומים סטטיסטיים**: ad-level ≥8,000 impressions או ≥4 ימים; conversion verdicts ≥3× target CPA + ≥4 ימים כולל סופ"ש (IL: שישי-שבת).
- **Kill**: K1 zero-converter (spend≥3×CPA, 0 conv) · K2 expensive (≥5×CPA, CPA>2×) · K3 dead-creative (CTR<0.5% אחרי 8K imp) · K4 losing-sibling · K5 remarketing-exhaustion (freq>6).
- **Scale**: S1 steady-winner (CPA≤0.8×target, ≥5 conv, 3 ימים) → +20% (cooldown 48ש) · S2 strong (CPA≤0.6×, ≥10 conv) → +30% + הרחבה אופקית.
- **Refresh**: פרסונה/creative fatigue → וריאציה חדשה.

### A/B Testing
משתנה בודד נאכף בסכימה. פורמט hypothesis עברי: "אנחנו מאמינים ש[שינוי] עבור [פרסונה] ישפר את [מדד] ב-[כיוון], כי [תובנת פרסונה מצוטטת]". בדיקת היתכנות תקציב ב-draft: `requiredBudget = arms × 3 × targetCPA` — חוסם טסטים לא ריאליים.

### Compliance (מנוע חוקים + reviewer LLM) — verdict: PASS/WARN/BLOCK
- C1 מאפיינים אישיים: BLOCK על "אתה סובל מ...", "יש לך חובות" (עברית gendered מחמירה את ההפרה).
- C2 הבטחות לא ריאליות: BLOCK "מובטח", "100% הצלחה", מספרי הכנסה ללא disclaimer.
- C3 לפני/אחרי בורטיקלים רגישים (הרזיה/אסתטיקה/שיניים): BLOCK; מוצע חלופה (process shots).
- C4 ורטיקלים מוגבלים IL: קריפטו/פורקס דורש אישור Meta; פיננסים/בריאות — special ad categories + איפוק.
BLOCK לא נכנס ל-Review & Approve; WARN דורש acknowledgment מתועד.

---

## 9. אינטגרציית Meta / MCP

- **OAuth**: Facebook Login for Business v23.0. scopes מינימליים: `ads_read, pages_show_list, business_management` (קריאה). `ads_management` מתבקש **מאוחר**, רק בפרסום ראשון.
- **MetaConnector**: ממשק אחד, 3 מימושים. **invariant**: כל `create*` יוצר PAUSED; עלייה לאוויר רק דרך `activateEntity` עם Approval consumed.
- **Draft-First Publishing** (state machine): DRAFT → PENDING_APPROVAL → APPROVED → PUBLISHING → PUBLISHED (PAUSED) → activate top-down → LIVE. כישלון חלקי → ERROR, ה-meta ids נשמרים (הכל PAUSED, אף פעם לא half-live).
- **Sync**: insights עם `time_increment=1` (סדרות יומיות), fields: spend, impressions, reach, clicks, ctr, cpc, cpm, actions→leads, purchase_roas. → `performance_snapshots`.
- **MCP**: `McpMetaConnector` ממפה ל-tools (`ads_get_ad_accounts`, `ads_create_campaign`, `ads_activate_entity`...). allowlist: read חופשי, write דורש approvalId. ראה [docs/META_MCP_TOOLS.md](./META_MCP_TOOLS.md). fallback ל-Marketing API כשאין MCP.

---

## 10. תוכנית אבטחה

- **הצפנת טוקנים**: AES-256-GCM envelope. Dev: `CREDENTIALS_ENCRYPTION_KEY` (32B hex). Prod: KMS + per-org DEK. `encrypted_credentials`: ciphertext/iv/authTag/keyVersion.
- **Auth**: argon2id (memory 64MB, time 3). login enumeration-safe (dummy verify + timing קבוע). Access JWT 15m + `tokenVersion` לביטול; refresh 7d מסובב, מאוחסן hashed.
- **RBAC** (deny-by-default): ADMIN / AGENCY_OWNER (מלא) / ACCOUNT_MANAGER (עובד אך **לא** approve/publish/members) / CLIENT_VIEWER (קריאה, scoped ללקוחות). מטריצה ב-`packages/shared/src/permissions.ts`.
- **Maker-checker**: מי שמבקש אישור ≠ מי שמאשר (אלא אם org עם חבר יחיד).
- **Audit**: immutable, actorId/action/entityType/before+after hashes/ip/ua על כל mutation רגישה.
- **AI logging**: כל קריאה עם input/output SHA-256.
- **Rate limiting**: tiers per route. **OAuth state**: HMAC-signed (orgId/userId/nonce/exp), דוחה tampering. **הצגת payload מדויק לפני שליחה** — חוזה מחייב.

---

## 11. DevOps

- **דמו מקומי**: docker-compose (postgres:16 + redis:7 + minio). degrade חינני: בלי Redis → in-process queue; בלי Meta/AI keys → mock connectors (`META_MODE=mock`, `AI_PROVIDER=mock`).
- **Migrations**: `prisma migrate dev/deploy`.
- **CI**: install → lint → typecheck → unit → integration (postgres service) → build.
- **Logs**: pino JSON (requestId/orgId/userId). **Errors**: Sentry מאחורי interface. Health: `/health`, `/ready`.
- **Jobs**: BullMQ queues (meta-sync, agent-runs, insights-refresh) + cron.

---

## 12. תוכנית בדיקות (QA)

פירמידה: vitest unit (services + agents עם mocks) → integration (API endpoints, test DB) → e2e smoke (Playwright, מאוחר).
~25 מבחני MVP קריטיים כולל: בידוד דיירים (org A → client של org B = 404), RBAC (CLIENT_VIEWER לא יכול POST /campaigns), approval flow (publish בלי approval = 409), token encryption round-trip, OAuth state tampering, persona/ad schema validation, Meta error mapping, mock connector parity, audit על כל write, publish PAUSED-then-activate order, stale-hash 409.
DoD לכל מודול: typecheck נקי + happy path + tenant-isolation test + RBAC test.

---

## 13. <a name="conflicts"></a>הכרעות בסתירות בין מומחים

1. **Turborepo מול pnpm בלבד** (Architect רצה Turborepo). **הכרעה**: pnpm workspaces בלבד ל-MVP — פחות תלויות, מספיק ל-2 apps. Turborepo אופציונלי בהמשך.
2. **PGlite מול Postgres בדוקר לדמו** (Architect הציע PGlite WASM). **הכרעה**: Postgres אמיתי (הסביבה כוללת psql+docker). `META_MODE=mock` + in-process queue מספקים את דרישת "דמו ללא תשתית" בלי לפצל דיאלקט DB.
3. **EdDSA/tokenVersion/KMS/per-org DEK** (Security רצה מלא). **הכרעה ל-MVP**: HS256 JWT + refresh rotation + AES-256-GCM עם מפתח env יחיד. הטבלאות והממשקים מאפשרים שדרוג ל-KMS/DEK בלי מיגרציה כואבת.
4. **client_access join table מול clientScope array** (Security רצה טבלה). **הכרעה ל-MVP**: `organization_members.clientScope: String[]` — פשוט יותר, מכסה את הצורך; ניתן לנרמל לטבלה בהמשך.
5. **מספר Login Configs ל-Meta (READ/FULL)** (Meta expert). **הכרעה**: תמיכה בקונפיג יחיד עם scopes דרך env; incremental permission (בקשת ads_management בפרסום ראשון) מתועדת כ-flow אך scope מלא מותר ב-`META_OAUTH_SCOPES`.

---

## 14. מפת דרכים (MVP Roadmap)

| שלב | תוכן | סטטוס |
|---|---|---|
| **0 — Foundation** | monorepo, Prisma (27 טבלאות), shared contracts, Meta/AI adapters, API core (guards/crypto/audit/queue) | ✅ הושלם |
| **1 — Auth & Tenancy** | register/login/refresh, orgs, roles, members, audit-logs | 🔨 בבנייה (סוכני API) |
| **2 — Client Builder** | wizard, brand profile, persona generator, offers | 🔨 בבנייה |
| **3 — Meta Connection** | OAuth/MCP, ad account select, sync campaigns+insights, encrypted creds | 🔨 בבנייה |
| **4 — Campaign AI** | strategy/copy/creative generators, drafts, Review screen | 🔨 בבנייה |
| **5 — Publish & Sync** | approvals, PAUSED-first publish, activate, sync performance | 🔨 בבנייה |
| **6 — Optimization** | AI recommendations, A/B suggestions, budget scaling, alerts | 🔨 בבנייה |
| **7 — Frontend** | 19 מסכים RTL, ui kit, dashboards, charts | 🔨 בבנייה |

---

*מסמך זה נגזר מ-8 חוות דעת מומחים מלאות (ראה `docs/council-summary.md` לתמצית ההחלטות והסיכונים).*
