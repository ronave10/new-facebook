# מועצת המומחים — תמצית החלטות וסיכונים

> פלט 8 סוכני מומחה. המסמך הסמכותי לבנייה הוא docs/DESIGN.md; זהו נספח תמציתי.

## Chief Architect

**החלטות מפתח:**

- Monorepo: pnpm workspaces + Turborepo with apps/web (Next.js 14 App Router), apps/api (NestJS 10), packages/shared (zod schemas + types + constants), packages/db (Prisma schema + client + seed), packages/meta (MetaConnector abstraction + 3 implementations), packages/ai (AI provid...
- NestJS owns 100% of business logic and DB access. Next.js is a thin client: React Server Components fetch via a typed apiFetch() wrapper, mutations go through TanStack Query hooks calling the NestJS API. No Next.js server actions touch the database, ever.
- Database: PostgreSQL via docker-compose as the primary target. Demo fallback when no DATABASE_URL/Docker: Prisma driverAdapters preview feature + PGlite (embedded WASM Postgres, persisted to ./.data/pglite) through the pglite prisma adapter, selected in packages/db/src/client.ts ...
- Tenant isolation enforced in three stacked layers: (1) JwtAuthGuard + TenantContextGuard resolve { userId, organizationId, role, allowedClientIds } into an AsyncLocalStorage RequestContext; (2) a Prisma Client Extension (tenantPrisma) auto-injects organizationId into every where/...
- Validation: zod is the single source of truth, defined once in packages/shared/src/schemas/**. API uses a custom ZodValidationPipe + a zodDto() mixin helper (no nestjs-zod dependency); all DTO types are z.infer exports. Web reuses the identical schemas via @campaignos/shared with...
- Auth: self-hosted email/password with argon2id, short-lived JWT access token (15 min, in memory on web) + rotating refresh token (7d, httpOnly SameSite=Lax cookie, hashed in DB). RBAC roles ADMIN > AGENCY_OWNER > ACCOUNT_MANAGER > CLIENT_VIEWER enforced by @Roles() decorator + Ro...
- Queue: a QueueDriver port defined in apps/api/src/modules/jobs/queue.driver.ts with two adapters — BullMqDriver (when REDIS_URL set) and InProcessDriver (setTimeout + p-limit concurrency, jobs persisted to the background_jobs table for crash visibility). Five queues: agent-pipeli...
- Agent pipeline: every agent is an AgentDefinition<I,O> object { name, version, inputSchema: ZodType<I>, outputSchema: ZodType<O>, buildPrompt(input, ctx), postProcess? } registered in a static AGENT_REGISTRY. AgentRunnerService executes: validate input → render prompt → ai.genera...
- MetaConnector: interface in packages/meta with MockMetaConnector (deterministic seeded fixtures, default in dev), MarketingApiConnector (Graph API v21.0 via fetch), McpMetaConnector (spawns/attaches the Meta Ads MCP server via @modelcontextprotocol/sdk stdio client and maps tools...
- Approvals: approvals table row = { entityType, entityId, planJson, payloadHash, status(PENDING/APPROVED/REJECTED/CONSUMED/EXPIRED), requestedById, approvedById, expiresAt }. POST /campaigns/:id/approve creates/approves; POST /campaigns/:id/publish requires body { approvalId } and...
- AI adapter: packages/ai exposes AiProvider { generateStructured<T>(opts: { system, prompt, schema: ZodType<T>, maxTokens, temperature }): Promise<{ data: T, usage }> ; generateText(opts) }. Implementations: AnthropicProvider (claude-sonnet default via tool-use forced JSON), MockA...
- API conventions: cursor pagination everywhere — GET lists accept ?limit(<=100, default 25)&cursor(opaque base64url of {v: sortValue, id})&sortBy&sortDir&q plus flat filter params (e.g. ?status=ACTIVE&clientId=...); response envelope { data: T[], meta: { nextCursor: string|null, l...
- RTL/Hebrew: <html lang="he" dir="rtl"> at the root layout, Tailwind with logical properties only (ms-/me-/ps-/pe-/start-/end- — a custom eslint rule bans ml-/mr-/pl-/pr- in apps/web), Heebo variable font self-hosted, all UI strings in apps/web/src/i18n/he.ts as a typed dictionary...

**סיכונים ומיטיגציות:**

- **Cross-tenant data leak via a code path that bypasses the tenant-scoped Prisma client (raw SQL, SystemPrismaService misuse, background job wi** → TenantPrismaService is the only injectable in feature modules (SystemPrismaService restricted by an eslint no-restricted-imports rule to auth/jobs/meta-oauth); the Prisma extension
- **Accidental live publish or payload drift between what the user approved and what hits Meta (the product's single worst failure mode — spendi** → Single choke point (MetaWriteService) that structurally cannot be bypassed since only it holds a connector reference; approvals are single-use, hash-bound to canonical JSON of the 
- **Meta token compromise or plaintext leakage (long-lived tokens grant ad-account spend control).** → AES-256-GCM with per-record IV + auth tag, key only in env, keyVersion column for rotation; tokens never serialized into DTOs (encrypted_credentials accessed solely by TokenCryptoS
- **LLM structured-output unreliability — invalid JSON, schema drift, Hebrew content quality, or hallucinated compliance-violating copy reaching** → generateStructured forces tool-use JSON + zod parse + one repair pass + one retry, terminal failures surface as AI_OUTPUT_INVALID with the run preserved in agent_runs for debugging
- **Meta Marketing API friction: app review for ads_management scope takes weeks, rate limits during insight backfills, and API version deprecat** → The three-connector abstraction makes Meta access a swappable detail: development and demos run on MockMetaConnector, and the McpMetaConnector path exercises real Meta semantics vi
- **Demo-mode divergence: PGlite/in-process-queue/mock providers behave subtly differently from Postgres/BullMQ/real providers, so 'works in dem** → PGlite is real Postgres semantics (same migrations, same Prisma queries); a queue-driver contract test suite runs identical scenarios against both drivers in CI; capability flags o
- **Scope explosion: 19 screens, 10 agents, 26 tables in one build session — risk of shipping 40% of everything instead of 100% of the MVP core.** → Strict adherence to the 6-phase build order below with hard 'definition of done' per phase; phase-4+ screens (Launch Center, Recommendations) degrade to simpler versions (a status 
- **In-process queue loses in-flight jobs on process crash (no Redis persistence), potentially stranding a half-published campaign.** → All jobs mirrored to background_jobs table with status transitions; publish plans persist each obtained Meta id immediately, so replay skips completed plans (idempotent resume); or

## Meta Marketing API / MCP Integration Specialist

**החלטות מפתח:**

- Use Facebook Login for Business with a config_id-based OAuth flow, staged scope requests: ads_read + pages_show_list + business_management at first connect; ads_management requested via auth_type=rerequest only when the org first attempts a publish action.
- Pin Graph API v23.0 as a single META_GRAPH_VERSION constant used by a buildGraphUrl() helper; never hardcode versions in call sites; log the facebook-api-version response header and alert on drift.
- MetaConnector is a pure TypeScript interface with three implementations (MockMetaConnector, MarketingApiConnector, McpMetaConnector) selected per-connection via meta_connections.connector_type, not per-environment via env var alone.
- Draft-first publishing: every Meta write creates entities with status=PAUSED at all three levels (campaign, ad set, ad); activation is a separate, second-approval operation that flips ad → ad set → campaign to ACTIVE in that order. Two distinct approval records: approvals.kind='P...
- Insights strategy: synchronous GET /{id}/insights with time_increment=1 for daily series ≤ 37 days at campaign/adset level; automatic fallback to async report runs (POST /{account}/insights → report_run_id → poll → paged fetch) when range > 37 days, level=ad, or any breakdown is ...
- Rate limiting is header-driven, not guess-driven: parse X-Business-Use-Case-Usage / X-Ad-Account-Usage / X-App-Usage on every response into Redis per ad account; a token-bucket gate in MetaHttpClient defers non-urgent jobs at >75% usage and hard-pauses the account's sync queue fo...
- MCP bridge: MetaMcpService wraps the MCP client with (a) per-tenant credential injection resolved from encrypted_credentials at call time, (b) a hard READ/WRITE/DENY tool allowlist using the exact tool names present in the environment, where every WRITE tool call must carry an ap...
- No reliance on Meta webhooks for ads data in MVP except the leadgen webhook (Page subscription) for real-time lead-ad capture. All campaign/insight freshness comes from tiered polling: entity sync every 6h + on publish, insights hourly (today+yesterday, active entities), daily 28...
- Token lifecycle: exchange short-lived → long-lived user token (fb_exchange_token, ~60 days) immediately in the OAuth callback; call /debug_token with app token to record expires_at, data_access_expires_at, granted granular scopes and asset scoping; encrypt with AES-256-GCM envelo...

**סיכונים ומיטיגציות:**

- **Meta App Review rejects or delays ads_management / business_management approval (Advanced Access requires Business verification, screencasts** → Build against Development Mode first (full API access for app admins/developers/testers — onboard pilot agencies' users as testers); ship MockMetaConnector + MCP path so product de
- **Long-lived user token expiry (~60 days) and data_access_expires_at (90 days) silently kill sync for agencies whose account manager doesn't l** → Daily debug_token health job, EXPIRING status at <10 days with email + in-app Hebrew banner and one-click reconnect that preserves account selections; sync jobs pause (not fail) on
- **BUC rate limiting at agency scale — one tenant with 30 ad accounts doing daily 28-day pulls can consume app-level quota and throttle all ten** → Per-ad-account header-driven gating with publish-queue priority over sync; 03:00 account-local-time scheduling spreads load; ad-level insights only for spending entities; async rep
- **MCP server credential model may be single-ambient-credential (session-level auth), making true multi-tenant isolation through McpMetaConnect** → CredentialResolver asserts the ambient credential's accessible ad accounts match the connection before every call and refuses otherwise; MCP connector gated to explicitly-flagged c
- **Payload drift between what the user approved and what gets sent to Meta (agent regenerates copy, budget edited after approval), violating th** → approvals.payload_hash = sha256 of the canonical serialized publish bundle; BaseMetaConnector recomputes at send time and hard-aborts on mismatch (state→PENDING_APPROVAL with 'הקמפ
- **Partial publish failures (campaign created, ad set validation fails on e.g. minimum budget code 2446036) leaving orphaned Meta entities and ** → Checkpoint every created meta id locally before proceeding; forward-only idempotent retry after fixing inputs; explicit 'בטל העלאה' action that archives partial entities; PUBLISH_F
- **Insights restatement (28-day attribution) makes yesterday's CPL change for weeks — alerts and kill/scale rules can fire on numbers that late** → Upsert-by-day snapshots with restated_at tracking; Optimization agent rules evaluate metrics with a 72h maturity delay for conversion-based KPIs (CTR/CPC evaluated immediately, CPA
- **Meta ad policy disapprovals after activation (health/finance/employment special categories, Hebrew text policy nuances) surprise users who a** → Compliance agent runs before Review screen using brand restrictions + special_ad_categories heuristics; special_ad_categories is a required wizard field when industry ∈ {housing, c

## Head of Product

**החלטות מפתח:**

- Client-centric information architecture: everything (personas, Meta connection, campaigns, analytics) lives under a Client workspace, not at the org level. Global nav = Dashboard / Clients / Settings; all campaign work happens inside /clients/:clientId/*.
- The Create Client Wizard is 5 steps with progressive disclosure; only Step 1 (business basics) is required to create the client. Steps 2-5 can be completed later from the Client Profile via a 'Profile completeness' meter (0-100%). Persona generation unlocks at >=60% completeness;...
- Review & Approve is a blocking, payload-literal gate: the approval record stores the exact JSON payloads that will be sent to Meta, hashed (sha256), and the publisher refuses to send anything whose hash differs from the approved hash. Any edit after approval invalidates the appro...
- Everything publishes PAUSED. Publishing creates campaign/ad sets/ads in PAUSED status on Meta; a separate 'Activate' action (with typed confirmation of daily budget, e.g. type the budget amount) flips to ACTIVE via ads_activate_entity.
- MetaConnector is a runtime-selected strategy (env META_CONNECTOR=mock|mcp|graph), and MockMetaConnector is a first-class product feature: seed data includes a fully mocked demo agency ('סוכנות דמו') with 2 clients, connected mock ad account, 90 days of realistic synthetic insight...
- AI generation is always persona-anchored and always produces structured JSON validated by zod, stored as generated_copy_variants rows with status (suggested/selected/edited/discarded), never free text dumped into a textarea.
- MVP scopes AI creative to text + creative briefs only. No image/video generation; the Creative Brief Generator outputs a structured brief (format, visual concept, on-image text, mood, do/don't) that a human designer executes, and media is uploaded manually.
- Hebrew-first, RTL-first UI with an i18n layer (next-intl) from day one; all copy keys in he.json with en.json fallback. Numbers, currency (₪ default), and dates localized; charts and KPI tiles mirrored for RTL.
- Roles are exactly four with a fixed capability matrix: Admin (platform ops, all orgs), Agency Owner (org settings, billing, team, all clients, approve+publish), Account Manager (assigned clients, create/edit/generate, can request approval, can publish only if granted 'publisher' ...
- Agent pipeline runs as BullMQ jobs with an in-process in-memory queue fallback (QUEUE_DRIVER=memory) so the demo works without Redis; every agent run persisted to agent_runs with input_hash, output_hash, model, tokens, latency, status, and rendered in an 'Activity' drawer per cli...

**סיכונים ומיטיגציות:**

- **Meta app review / Advanced Access for ads_management scopes takes weeks and can fail, blocking real-account usage at launch.** → Ship MVP on MockMetaConnector + McpMetaConnector (dev-token/MCP bridge) paths; design OAuth module so MarketingApiConnector slots in without UI change; start app review paperwork i
- **Users publish AI-generated ads that violate Meta policy or Israeli regulation (finance/health/employment special categories), risking client** → Compliance agent runs on every variant with BLOCK gating in Review & Approve; special-ad-category declaration required by industry in preflight validation; forbidden words/promises
- **AI generation quality in Hebrew (marketing copy, personas) is mediocre, killing the core value proposition; users churn after first bad gene** → Persona/copy prompts gated on profile completeness (≥60%/≥80%) so garbage-in is prevented at product level; track variant acceptance rate as a first-class metric with an 8% alarm t
- **Tenant isolation bug leaks one agency's client data to another — catastrophic trust breach in an agency market where clients are the busines** → org_id scoping enforced in a single repository-layer guard (every Prisma query goes through tenant-scoped repositories), never ad-hoc where-clauses; integration test suite that att
- **Accidental spend: a bug or misclick activates a campaign or raises a budget without informed consent.** → Hash-pinned approvals enforced in the service layer; two-phase publish (PAUSED then activate); typed-budget confirmation on activation and budget changes; live mutations route thro
- **Scope explosion in a single build session: 19 screens + 10 agents + 26 tables cannot all be production-deep; risk of everything half-built.** → Strict MVP cut (design section 'MVP vs Phase 2+'): Optimization/alerts/experiments/Graph-API deferred; Research agent deferred; screens 16 ships as stub with 'בקרוב' only if time r
- **Demo/dev environment fails (no Postgres/Redis in container), making the product undemoable exactly when it matters.** → Degradation ladder is a designed feature: `pnpm demo` boots SQLite + memory queue + local storage + mock connector with seeded data; docker-compose for full-fidelity local dev; con
- **Review & Approve screen becomes so heavy (JSON payloads, compliance, validation) that users rubber-stamp without reading, defeating its purp** → Layered disclosure: human summary first, budget in large type, tree with previews, payloads one click away but mandatory-available; BLOCK findings physically disable the button; me
- **Token/credential compromise — Meta tokens grant spend authority over client money.** → encrypted_credentials table with AES-256-GCM, key from env/KMS, tokens never serialized into logs/payload previews by construction (redaction at the logger and DTO layer), minimal 

## Performance Marketing Expert (Meta Ads Specialist, Israeli market)

**החלטות מפתח:**

- Hierarchical ad-generation graph (Persona → Angle → Hook → Copy assets) instead of flat independent lists of 10 hooks / 10 texts / 10 headlines.
- Three fixed budget tiers in ILS/day (<100, 100–500, 500+) drive campaign-structure templates deterministically in code; the LLM only fills copy/rationale, never invents structure.
- Pixel-data gates computed from synced insights decide whether remarketing/lookalike layers are even offered: remarketing requires ≥1,000 site visitors/30d OR ≥2,000 page/IG engagers/90d; lookalikes require a seed of ≥1,000 people in Israel (≥100 hard minimum, but we gate at 1,000...
- KPI benchmarks stored as a versioned seed table (kpi_benchmarks: objective × vertical × metric → p25/p50/p75 in ILS) rather than hardcoded in prompts; alerts fire on deviation from client's own trailing 14-day baseline first, market benchmark second.
- Kill/scale/refresh rules are statistical guards evaluated by the Optimization Agent as pure functions over performance_snapshots, and every action they propose is a recommendation requiring approval — never auto-executed, including pause.
- Compliance Agent runs as a deterministic rule engine (regex/keyword lists per category, Hebrew + English) FIRST, then an LLM policy reviewer for nuance; output is per-asset verdicts PASS/WARN/BLOCK with policy citations. BLOCK assets cannot enter Review & Approve.
- Personas are generated in Hebrew with Israeli cultural grounding baked into the prompt (named archetypes like 'רונית, 42, אמא לשלושה מרעננה'), and each persona carries machine-usable targeting hints (interest keywords in English for Meta's API, age bracket, platform lean) alongsi...
- A/B framework enforces one-variable-at-a-time at the schema level: an ExperimentDraft has exactly one variableUnderTest enum (creative|hook|audience|placement|landing_page|offer) and the builder refuses to create a test where variants differ in more than that dimension.

**סיכונים ומיטיגציות:**

- **Benchmark drift: seeded Israeli CPL/CPM values go stale (war/elections/holiday cycles move CPMs 30–80%), causing false alerts and bad onboar** → Benchmarks are versioned DB rows with validFrom, seasonality modifier table, and baseline-first alerting (client's own trailing 14d median dominates once history exists). Ship an a
- **LLM output incoherence or schema drift breaks the ad matrix (mismatched angle lineage, invented benefits, Hebrew that reads like translated ** → Code-level coherence validator (parentAngleId invariants, style compatibility table, offer-grounding index references), zod parsing with 2 retry-with-feedback loops, and golden-set
- **Compliance false confidence: passing our checklist is NOT Meta approval; a client in finance/health gets ads rejected or the ad account flag** → Verdict language is explicitly 'בדיקה מקדימה — האישור הסופי הוא של מטא'; WARN acknowledgments audited; restricted-vertical clients require an org-level 'Meta authorization confirme
- **Small budgets (Tier A, the majority of Israeli SMBs) cannot reach A/B or kill-rule statistical minimums, so the optimization layer looks dea** → Tier-aware behavior baked in: Tier A blocks parallel tests (sequential only), kill rules gate on 3× CPA spend regardless of impatience, and the dashboard shows 'אוסף נתונים — עוד ₪
- **Kill/scale recommendations executed on stale or partial synced data (Meta attribution lag up to 72h for conversions) cause wrong pauses of a** → Optimization windows always exclude the last 24–48h for conversion metrics (configurable attributionLagHours=48 default), recommendations display the data window explicitly, and re
- **Persona/copy generation leaks brand restrictions or cross-tenant context via prompt contamination (shared context windows, cached prompts).** → AgentRunner builds prompts exclusively from the single clientId's data (no cross-client memory in MVP), logs input/output hashes per run, and the restriction-word scan runs post-ge

## UX/UI Lead — Hebrew RTL Specialist

**החלטות מפתח:**

- Global RTL via <html lang="he" dir="rtl"> + Tailwind logical utilities only (ms-*/me-*/ps-*/pe-*/start-*/end-*/text-start/text-end). No tailwindcss-rtl plugin, no [dir] variant hacks.
- Hebrew font: Heebo (weights 400/500/600/700) via next/font/google with display:swap, CSS variable --font-heebo; fallback stack 'Heebo', 'Noto Sans Hebrew', -apple-system, 'Segoe UI', sans-serif. Tabular numerals (font-variant-numeric: tabular-nums) on all metric displays.
- Dark sidebar (#0F172A) + light content area (#F8FAFC bg, #FFFFFF surfaces). Primary brand color: indigo #4F46E5.
- All numbers, currency, metric abbreviations (CTR, CPC, ROAS), URLs, and API payloads render inside <bdi> or a <span dir="ltr" class="inline-block tabular-nums"> wrapper — formalized as a single <Num> / <Ltr> component pair used everywhere.
- Directional icons flip with a single .icon-flip utility (transform: scaleX(-1)) applied to arrows/chevrons/back/next/send/logout only; symmetric icons (search, bell, gear) and brand/media icons (Meta logo, play button, checkmarks) never flip. Icon set: lucide-react.
- Review & Approve is a mandatory full-page gate (route /campaigns/[id]/review), not a modal: right column (read first in RTL) = 'מה יישלח ל-Meta' (the exact payload, humanized), left column = 'מצב נוכחי בחשבון'. Publish button is enabled only after (a) scrolling the payload panel ...
- Wizard = 6 steps with URL-addressable steps (?step=3), autosave-on-blur + 800ms debounce to a server draft (status: 'draft'), an always-visible 'נשמר אוטומטית ✓ HH:MM' indicator, and free back-navigation; only the current step validates on 'המשך'. Stepper renders right-to-left (s...
- Status vocabulary is a closed, centralized enum→Hebrew map in one file (statusLabels.ts) with paired chip styles; no screen ever hardcodes a status string.
- Ad preview card is a pixel-honest Facebook mobile-feed replica (375px frame) built in-house (AdPreviewCard), with dir="auto" on every user-content text node and the Meta-accurate truncation rules (primary text clamps ~125 chars with 'עוד' expander).
- Microcopy addresses the user in second-person plural ('אתם') — e.g. 'נסו שוב', 'בחרו חשבון מודעות' — never gendered singular.

**סיכונים ומיטיגציות:**

- **Bidi corruption in mixed Hebrew/Latin/number strings (metrics like 'CPC ₪2.40', ids like act_1234, ranges '18-24') producing scrambled or re** → All numeric/Latin content flows exclusively through <Num>/<Ltr>/<bdi> components; ESLint ban on physical direction utilities; a dedicated Playwright visual-regression suite with a 
- **Third-party libraries with LTR assumptions (Recharts SVG coordinates, TanStack Table sticky columns, react-day-picker, Radix popper position** → Chart islands wrapped in dir="ltr" with legends/labels lifted into RTL DOM; Radix wrapped once in DirectionProvider dir="rtl" and never used raw; each third-party integration gets 
- **Users reflex-approving Meta writes (real money) because the Review & Approve screen becomes routine — a ₪150/day typo becomes ₪1,500/day.** → Typed-name confirmation on any op that starts or changes live spend; budget values above a per-org threshold render with a warning highlight and require an extra checkbox; the diff
- **AI generation latency (10 angles × personas can take 30–90s) makes the generator feel broken; users spam-click regenerate.** → AgentRunTimeline with per-step streaming status and partial results rendering as they arrive; generate buttons disable with progress state; BullMQ job ids shown so a refresh resume
- **Hebrew microcopy inconsistency (gender, register, inflected statuses) as multiple developers/AI agents write strings ad hoc.** → All strings live in a single he.ts dictionary (typed keys) from day one — zero inline Hebrew in JSX; tone rules (plural address, no gendered singular, status noun-forms) documented
- **The Facebook-style AdPreviewCard drifts from Meta's real rendering (truncation lengths, CTA labels, aspect ratios), eroding trust when publi** → Truncation/char limits stored as named constants (META_LIMITS) with source comments; when a connection exists, the 'תצוגה רשמית מ-Meta' tab (ads_get_ad_preview) is shown beside our
- **Demo/dev mode (MockMetaConnector, no Postgres/Redis) gets visually confused with production, or worse — a real connector runs when the user ** → Persistent MockModeBanner strip driven by the active connector type (server-reported, not env-guessed); mock data visibly watermarked (client 'קפה גרג — דמו'); the Review & Approve

## Security & Privacy Engineer

**החלטות מפתח:**

- Envelope encryption (AES-256-GCM) with a per-organization Data Encryption Key (DEK) wrapped by a versioned master Key Encryption Key (KEK) loaded from env in dev and KMS in prod, via a single CryptoService with pluggable KeyProvider (EnvKeyProvider | KmsKeyProvider).
- Argon2id password hashing (memoryCost=65536 KiB, timeCost=3, parallelism=4) + short-lived JWT access tokens (15m, RS256/EdDSA) + opaque rotating refresh tokens (7d) stored hashed in a refresh_tokens table with token-family reuse detection; per-user tokenVersion for global session...
- Four-layer tenant isolation: (1) orgId claim in JWT, (2) NestJS TenantContextMiddleware placing {orgId, userId, role} into AsyncLocalStorage, (3) all data access through TenantScopedRepository which injects `where: { orgId }` and is the ONLY layer allowed to touch PrismaClient, e...
- Deny-by-default RBAC with a static compile-time permission matrix (4 roles x ~20 permissions) enforced by @RequirePermission() decorator + PermissionsGuard; Client Viewer is additionally row-scoped via a client_access join table (viewer sees only assigned clients).
- Publish safety: campaign.publish requires (a) an approvals row in status=approved created by a user holding campaign.approve, (b) approval.payloadHash === SHA-256 of the exact Meta payload about to be sent (any post-approval edit voids the approval), (c) a fresh re-confirmation t...
- Immutable, hash-chained audit log: append-only audit_logs table (no UPDATE/DELETE grants for the app role, enforced by a Postgres REVOKE + trigger raising exception), each row stores prevHash and rowHash = SHA-256(prevHash || canonical(row)) forming a per-org chain.
- OAuth hardening: state = base64url(JSON{orgId,userId,nonce,iat,exp}) + '.' + HMAC-SHA256(payload, OAUTH_STATE_SECRET), 10-minute expiry, nonce single-use (Redis SETNX with TTL, in-memory Map fallback in dev); PKCE (S256) included in the authorize URL; callback exchanges code serv...
- AI-call ledger separate from audit_logs: agent_runs stores agentName, model, promptVersion, inputSha256, outputSha256, tokensIn/out, latencyMs, costMicroUsd, status, plus S3 pointers to the redacted full input/output bodies (bucket with 90-day lifecycle); hashes in Postgres, bodi...
- Rate limiting: Redis fixed-window+sliding hybrid via a NestJS ThrottlerStorage adapter with four tiers — auth endpoints 5/min/IP + 20/hour/IP, standard API 100/min/user, AI generation 10/min/org + 100/day/org, Meta writes 30/min/org with a circuit breaker that trips on Meta error...
- Meta data minimization + deletion: store only campaign-management data (no end-user/lead PII from Lead Ads in MVP; leads stay in Meta, we store counts only), implement the signed_request Data Deletion Callback (HMAC-SHA256 with app secret, verify then enqueue DeleteMetaUserDataJo...

**סיכונים ומיטיגציות:**

- **A missed tenant filter in a new query path leaks another agency's client/campaign data (highest-severity breach class for this product).** → Four stacked layers (repo chokepoint + ESLint import ban + composite FKs + RLS) plus the auto-generated cross-tenant test suite that exercises every :id endpoint as the wrong org i
- **Master KEK compromise via leaked env/backup decrypts all Meta tokens, letting an attacker run ads on clients' money.** → KMS KeyProvider in prod (KEK never at rest on disk), per-org DEKs limit blast radius during rotation, credential.decrypt audit rows for forensics, documented emergency runbook: rot
- **Approval bypass: a publish path (especially the MCP connector bridge) that doesn't route through Review & Approve mutates live campaigns wit** → Publish/mutate is only reachable through MetaConnector, and MetaWriteInterceptor wraps ALL connector implementations (Mock/GraphAPI/MCP) verifying an approved payloadHash before an
- **Meta App Review / business verification delays or scope rejection block the real MarketingApiConnector at launch.** → Start business verification immediately; request minimal scopes with clear screencasts; MockMetaConnector and MCP connector keep dev/demo fully functional; deletion + deauth callba
- **Demo-mode fallbacks (in-memory rate limiter, no Redis, RLS flag off, env KEK) accidentally ship to production, silently weakening controls.** → Boot-time EnvSchema asserts NODE_ENV=production requires REDIS_URL, KmsKeyProvider (or explicit ALLOW_ENV_KEK=true acknowledged flag), RLS_ENFORCED=true, and HTTPS origins — server
- **AI-generated ad copy violates Meta ad policy or the client's regulatory restrictions and gets published, risking ad-account bans (agency's l** → Deterministic forbidden-word/promise filter in code (not just LLM), ComplianceAgent notes on every variant, Special Ad Category declaration in the wizard, blocking violations exclu
- **Audit log or AI-log growth degrades the primary DB and blows retention/GDPR commitments.** → Hashes+bounded diffs in Postgres, full bodies in S3 with lifecycle rules, single DataRetentionJob owning all TTLs, seq-based archival export to object-locked S3 after 2 years.
- **Refresh-token cookie CSRF or token theft via a future XSS in the RTL-heavy custom UI.** → httpOnly SameSite=Strict Path=/auth/refresh cookie, Origin allowlist on refresh, rotation with family reuse detection, strict CSP with no inline scripts, React default escaping and

## DevOps/Platform Engineer

**החלטות מפתח:**

- Single pnpm monorepo with pnpm workspaces + turborepo: apps/web (Next.js), apps/api (NestJS), packages/db (Prisma schema + client), packages/shared (zod DTOs, types), packages/connectors (MetaConnector implementations), packages/agents (agent pipeline).
- Driver-pattern infrastructure adapters selected by env vars: QUEUE_DRIVER=bullmq|inprocess, STORAGE_DRIVER=s3|local, META_CONNECTOR=mock|mcp|graph, AI_PROVIDER=anthropic|openai|mock, ERROR_TRACKER=sentry|noop. Each behind a NestJS injection token (QUEUE_SERVICE, STORAGE_SERVICE, ...
- BullMQ with three queues (meta-sync, agent-runs, insights-refresh) plus a repeatable-job scheduler registered at API boot; the worker runs inside the API process by default (WORKER_MODE=embedded) with an option to run as a separate process (WORKER_MODE=dedicated, `pnpm --filter a...
- Secrets: local = .env (gitignored) + committed .env.example; staging/prod = platform-managed secrets (Railway/Render env groups or AWS SSM Parameter Store via chamber). Meta tokens encrypted at rest with AES-256-GCM using a 32-byte CREDENTIALS_ENCRYPTION_KEY (base64), stored in e...
- CI on GitHub Actions, single workflow with jobs: setup(install+cache) -> [lint, typecheck, unit] in parallel -> integration (services: postgres:16, redis:7) -> e2e-smoke (docker-compose up, seeded, Playwright against mock connectors) -> build (turbo build + docker image). Deploy:...
- Prisma migration workflow: `prisma migrate dev` locally (creates migration + applies + regenerates client), migrations committed; CI runs `prisma migrate diff --exit-code` to catch drift and `prisma migrate deploy` in the integration job; production deploy runs `prisma migrate de...
- Structured logging with pino: one JSON line per event, base bindings {service, env, version}, per-request AsyncLocalStorage context injecting {requestId, orgId, userId, clientId} into every log line; nestjs-pino for HTTP access logs; redact paths ['req.headers.authorization','req...
- Staging/production topology: Railway (or Render — equivalent) running 2 services (api, web) + managed Postgres 16 + managed Redis 7 + Cloudflare R2 for S3 storage; Sentry SaaS for errors; Better Stack (logtail) for log aggregation + uptime checks. One staging environment mirrorin...
- Hard publish-safety enforcement at the connector boundary: every MetaConnector write method requires an ApprovalToken {approvalId, campaignDraftHash, approvedBy, expiresAt} argument; MarketingApiConnector/McpMetaConnector throw ApprovalRequiredError if missing/expired/hash-mismat...

**סיכונים ומיטיגציות:**

- **Embedded worker (WORKER_MODE=embedded) lets long AI agent jobs (minutes each) starve API event loop / memory, causing p95 latency spikes and** → agent-runs concurrency capped at 2; AI calls are I/O-bound (await on HTTP) not CPU-bound, and any CPU-ish steps (hashing, JSON canonicalization) are small; /health/live has no depe
- **Mock-first development drifts from real Meta Graph API behavior (pagination, async ad creation, error subcodes, rate limits), so the first r** → MockMetaConnector validates writes against the same zod payload schemas as MarketingApiConnector (shared in packages/connectors/src/meta/payloads.ts); a contract-test suite runs th
- **In-process queue driver in demo/sandbox silently loses scheduled work on restart or behaves differently enough from BullMQ (no cross-process** → Both drivers persist to the background_jobs table with identical rows; inprocess re-enqueues incomplete rows on boot; the CI integration job runs the SAME job-handler tests under Q
- **Token/secret leakage: Meta access tokens or AI keys end up in logs, Sentry events, agent_runs payloads, or the 'show exact payload before se** → Defense in depth: pino redact paths on all token-shaped keys; Sentry beforeSend regex-strips EAA* token patterns; agent_runs stores input/output hashes plus payloads that pass a sa
- **Meta Graph API rate limits (BUC/app-level) throttle the 30-min sync cron once agencies connect many ad accounts, causing cascading job retri** → Client-side token bucket (META_RATE_LIMIT_RPS) per connection; connector reads X-Business-Use-Case-Usage headers and when usage>80% raises a Backoff signal that the job handler con
- **PGlite/pglite fallback (for the no-Docker sandbox) diverges from Postgres 16 on features the schema uses (extensions, specific index types),** → Schema policy: stick to plain Postgres features Prisma emits by default (no extensions beyond pgcrypto-free cuid generation in app code, btree indexes, jsonb); CI integration job a
- **Small team + PaaS lock-in: Railway/Render outage or pricing change with no portability plan.** → Everything runs from two standard Docker images + env vars — the compose file already proves the full stack runs anywhere; DATABASE_URL/REDIS_URL/S3_* are generic; a docs/deploy-po

## QA Lead — Test Strategy & Quality Gates for CampaignOS AI

**החלטות מפתח:**

- Single test runner: Vitest everywhere (apps/api, apps/web, packages/*), no Jest.
- Integration tests boot the real NestJS app in-process via `Test.createTestingModule({imports:[AppModule]})` + `app.listen(0)` and hit it with global `fetch` — no supertest.
- Two-tier DB strategy: Tier A integration tests run against real Postgres (docker-compose service, one isolated schema per test file via `DATABASE_URL?schema=t_<sha1(filepath)>` + `prisma db push`); Tier B service/unit tests use a hand-rolled `createPrismaMock()` (typed Proxy over...
- All AI-dependent tests use MockAiProvider with canned fixtures keyed by `taskKey` (e.g. "persona.generate" → packages/ai/src/fixtures/persona.generate.json), and every fixture file is itself validated against the corresponding zod schema in a dedicated test.
- MockMetaConnector is a first-class product component (not just a test double) with a scriptable failure-injection API: `mock.failNext("createAd", {code: 190})`, `mock.failNext("createAdSet", {code: 613, times: 2})`. A shared conformance suite `describeMetaConnectorContract(makeCo...
- Contract testing = the shared zod schemas in @campaignos/shared ARE the contract. Enforced by: (1) API DTOs must import schemas from shared, verified by a lint-style test greping apps/api/src/**/dto.ts for local zod object definitions duplicating shared ones; (2) apps/web/src/lib...
- Publish safety is tested as a state machine with an explicit rollback contract: partial publish failure leaves all created Meta entities PAUSED (never activates anything), sets campaign status ERROR + lastError, persists created meta ids for cleanup, and NEVER auto-retries writes...
- E2E: Playwright smoke suite is Phase 6 (post-MVP-core), limited to 5 journeys against `META_MODE=mock AI_PROVIDER=mock` + seeded DB, run nightly/pre-release only — not on every PR. Until then, the top of the pyramid is the API-level integration suite.
- Every test uses factory functions with sensible defaults + override param (`makeOrg()`, `makeUserInOrg(org, {role: "CLIENT_VIEWER"})`, `makeClientWithBrandProfile(org)`, `makeDraftCampaignReadyToPublish(client)`) living in apps/api/test/factories/index.ts; the demo seed script (p...
- Audit coverage is enforced structurally, not per-endpoint: a single parameterized integration test iterates a MUTATION_MATRIX table (endpoint, method, permission, expectedAuditAction) covering all sensitive mutations, asserting both the 2xx path writes an AuditLog row AND the for...

**סיכונים ומיטיגציות:**

- **Tier A integration tests silently never run (DATABASE_URL_TEST unset everywhere), so tenant-isolation and unique-constraint coverage is gree** → CI job explicitly starts the postgres service and sets DATABASE_URL_TEST, then runs `pnpm test:int -- --reporter=json` and a gate script fails the build if skipped-count for files 
- **MockMetaConnector drifts from the real Marketing API (field names, PAUSED semantics, error shapes), making the whole demo-tested product wro** → Shared conformance suite (T24) is the single spec; MarketingApiConnector must pass the same suite against a Meta sandbox account behind META_SANDBOX_TOKEN before M5 is declared don
- **Approval bypass via alternate code paths — a future endpoint or the sync job calls connector create*/activate* directly without an Approval,** → Structural test: MetaCallLogger records every connector invocation with isWrite flag; invariant test asserts every isWrite=true MetaApiCallLog row in the entire integration-suite r
- **Fixture-driven agent tests give false confidence: real Anthropic output won't match the tidy fixtures (Hebrew quality, schema misses, refusa** → AnthropicProvider has its own internal schema-retry loop unit-tested with a stubbed SDK client (malformed→valid on retry 2); a nightly non-blocking 'live canary' vitest tag runs pe
- **Zod schema explosion and duplication across shared/dto/web makes the contract tests assert against the wrong copy, hiding drift they were me** → The dto.ts grep tripwire (section 5) fails CI on locally re-declared schemas outside an explicit allowlist; enum-parity test pins Prisma enums to shared zod enums; contract respons
- **The 28-gate suite becomes slow (each integration file boots full AppModule + pushes a schema), devs stop running it, quality gates rot.** → Budget enforced in CI: unit ≤ 60s, integration ≤ 5min, measured and failed by a timing gate. One AppModule boot per file (beforeAll, not beforeEach) with truncate-tables between te
- **Money math bugs (agorot minor units vs shekels) slip through because factories and fixtures use round numbers that hide off-by-100 errors.** → All factory money defaults are deliberately non-round (budgetAmount 15037 agorot); dedicated unit tests for the budget/insight math module assert ILS formatting (₪150.37) and that 
- **RTL/Hebrew regressions (mixed-direction strings, LTR numbers inside RTL sentences, flipped layouts) are invisible to the API-level suite and** → Deferred-but-scheduled: Playwright smoke includes `expect(page.locator('html')).toHaveAttribute('dir','rtl')` and screenshot snapshots of dashboard + wizard at he-IL locale; until 

