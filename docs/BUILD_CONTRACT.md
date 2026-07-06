# CampaignOS AI — Build Contract

This document is the binding contract for all builder agents. Deviating from it breaks integration.

## Global rules

1. **Do NOT add dependencies.** Every allowed dependency is already declared in the relevant `package.json`. If something seems missing, implement it with what exists.
2. **Do NOT edit files outside your ownership list.** Especially: `app.module.ts`, `package.json`, tsconfigs, and `packages/db/prisma/schema.prisma` are owned by the integrator.
3. **TypeScript strict.** Code must compile under the package's `tsc --noEmit`.
4. All user-facing strings in the web app are **Hebrew**. Code identifiers/comments are English.
5. API: every tenant-owned query MUST filter by `organizationId` from `AuthContext`. Never trust ids from the client without an org-scoped lookup.
6. Every sensitive mutation calls `AuditService.log()`. Every Meta write goes through an `Approval`.
7. Money values are stored in **minor units** (agorot/cents) as integers.

## Core primitives (already built — import, don't reinvent)

| Import | Purpose |
|---|---|
| `src/core/prisma.service.ts` → `PrismaService` | DB access |
| `src/core/auth-context.ts` → `AuthContext`, `@CurrentUser()`, `@Public()` | request identity |
| `src/core/permissions.guard.ts` → `@RequirePermission("client.write")` | RBAC (matrix in `@campaignos/shared`) |
| `src/core/zod-validation.pipe.ts` → `@Body(new ZodValidationPipe(schema))` | validation |
| `src/core/api-error.ts` → `AppException.notFound()` etc. | errors (Hebrew messages) |
| `src/core/crypto.service.ts` → `CryptoService` | AES-256-GCM + sha256 |
| `src/core/audit.service.ts` → `AuditService` | audit trail |
| `src/core/queue.service.ts` → `QueueService` | jobs (BullMQ or in-process) |
| `src/core/rate-limit.guard.ts` → `@RateLimit({limit, windowSec})` | throttling |
| `@campaignos/shared` | enums, permissions, Hebrew labels, API types |
| `@campaignos/meta` | `MetaConnector` interface + wire types + `MetaApiError` |
| `@campaignos/ai` | `AiProvider` interface |

NestJS conventions: one folder per module under `apps/api/src/<module>/` containing
`<module>.module.ts`, `<module>.controller.ts`, `<module>.service.ts`, `dto.ts` (zod schemas), optional extra services. Controllers are thin; services hold logic. Module classes are exported so the integrator can wire them into `AppModule`.

## API surface (global prefix `/api/v1`)

### auth module (`apps/api/src/auth/`)
- `POST /auth/register` `{email, password, name, organizationName}` → creates User + Organization + membership (AGENCY_OWNER) → AuthSession. `@Public()` + `@RateLimit`
- `POST /auth/login` `{email, password}` → AuthSession (memberships[0] org). `@Public()` + `@RateLimit`
- `POST /auth/refresh` `{refreshToken}` → new AuthSession (rotate: revoke old refresh row). `@Public()`
- `POST /auth/logout` `{refreshToken}` → revoke.
- `GET /auth/me` → `{user, organizationId, organizationName, role}`
- JWT access payload: `{sub, email, name, orgId, role, clientScope}`, secret `JWT_ACCESS_SECRET`, ttl `JWT_ACCESS_TTL`. Refresh tokens: random 48-byte hex, stored as sha256 hash in `RefreshToken`, ttl 7d.
- Passwords: argon2id (`argon2` package). The verify path must ALSO accept dev-seed hashes with prefix `scrypt$<saltHex>$<hashHex>` (node scryptSync, keylen 32) — the seed script is dependency-free.

### org module (`apps/api/src/org/`)
- `GET /org` → org details + member count. [org.read]
- `PUT /org` `{name}` [org.manage]
- `GET /org/members` [member.read]
- `POST /org/members` `{email, name, password, role, clientScope?}` — creates user if absent, adds membership [member.manage]
- `PUT /org/members/:id` `{role, clientScope?}` [member.manage]
- `DELETE /org/members/:id` [member.manage] (cannot remove last AGENCY_OWNER/ADMIN)
- `GET /audit-logs?page=&action=` → Paginated<AuditLog> [auditlog.read]

### clients module (`apps/api/src/clients/`)
- `POST /clients` (wizard payload: client fields + optional brandProfile) [client.write]
- `GET /clients?page=&search=` → Paginated<ClientSummary> — CLIENT_VIEWER with clientScope sees only scoped clients [client.read]
- `GET /clients/:id` (includes brandProfile, counts) / `PUT /clients/:id` / `DELETE /clients/:id` (soft: status ARCHIVED)
- `PUT /clients/:id/brand-profile` (upsert, `BrandProfilePayload` from shared) [brand.write]
- `GET /clients/:id/personas` [persona.read]
- `POST /clients/:id/personas/generate` `{count?: 3-5}` → runs PERSONA agent, persists CustomerPersona rows [persona.generate]
- `PUT /personas/:id` / `DELETE /personas/:id` [persona.write]
- Offers CRUD: `POST/GET /clients/:id/offers`, `PUT/DELETE /offers/:id`
- Competitors CRUD: `POST/GET /clients/:id/competitors`, `PUT/DELETE /competitors/:id`

### meta module (`apps/api/src/meta/`)
- `POST /meta/connect/start` `{clientId?}` → `{authUrl}` (real) or immediately connected mock connection when `META_MODE=mock` → `{connectionId}` [meta.connect]
- `GET /meta/connect/callback?code=&state=` `@Public()` — verifies HMAC-signed state (contains orgId, userId, clientId, nonce, exp), exchanges code→long-lived token, encrypts via CryptoService into EncryptedCredential, creates/updates MetaConnection, syncs ad accounts/pages/pixels, redirects to `WEB_URL/clients/{clientId}/meta?connected=1`
- `GET /meta/connections?clientId=` → MetaConnectionSummary[] [meta.read]
- `POST /meta/connections/:id/refresh` — re-pull accounts/pages/pixels [meta.connect]
- `DELETE /meta/connections/:id` — disconnect + delete credential [meta.connect]
- `GET /meta/ad-accounts?connectionId=` [meta.read]
- `POST /meta/ad-accounts/select` `{adAccountId (internal id), clientId}` [meta.connect]
- `GET /meta/campaigns?clientId=` — live list from connector [meta.read]
- `POST /meta/sync/:clientId` — sync entities + insights into PerformanceSnapshot (enqueue `meta-sync` job) [meta.sync]
- `GET /meta/insights?clientId=&level=&datePreset=` — normalized rows [meta.read]
- `MetaConnectorFactory` service: returns connector by `META_MODE` (mock | marketing-api | mcp). `MetaService.getContext(orgId, clientId)` decrypts token, builds `MetaConnectorContext`.
- **Every connector call** is wrapped by `MetaCallLogger` → writes `MetaApiCallLog` (operation, isWrite, durationMs, success, approvalId?).

### campaigns module (`apps/api/src/campaigns/`)
- `POST /campaigns/draft` `{clientId, name, goal, budgetType, budgetAmount, startAt?, endAt?, targetingDraft?}` [campaign.write]
- `GET /campaigns?clientId=&status=` → Paginated<CampaignSummary>
- `GET /campaigns/:id` → full (strategy, adSets, ads+creatives, approvals)
- `PUT /campaigns/:id` (only when status DRAFT/PENDING_APPROVAL) / `DELETE` (draft only)
- `POST /campaigns/:id/generate-strategy` → STRATEGY agent → upsert CampaignStrategy [campaign.generate]
- `POST /campaigns/:id/generate-ads` `{personaIds?, variantCount?}` → COPY+CREATIVE+COMPLIANCE agents → creates AdSets (per persona), Ads, AdCreatives, GeneratedCopyVariants [campaign.generate]
- `POST /campaigns/:id/request-approval` → builds EXACT Meta payload preview (`payloadPreview`), sha256 `payloadHash`, Approval PENDING; campaign → PENDING_APPROVAL [campaign.write]
- `GET /approvals?status=` → ApprovalSummary[] [campaign.read]
- `POST /approvals/:id/approve` / `POST /approvals/:id/reject` `{reason?}` [campaign.approve] — approver must differ from requester (maker-checker) unless role is ADMIN/AGENCY_OWNER and org has 1 member.
- `POST /campaigns/:id/publish` [campaign.publish] — requires APPROVED non-consumed Approval whose payloadHash matches a freshly rebuilt payload (reject 409 on drift); marks Approval CONSUMED; creates campaign/adsets/creatives/ads via connector **all PAUSED**, then `activateEntity` top-down; persists meta ids; campaign → PUBLISHED; full audit trail. Partial failure → status ERROR + lastError, entities left PAUSED (never half-live).
- `POST /campaigns/:id/pause` [campaign.pause] — pauses live campaign via connector (+ audit)

### analytics module (`apps/api/src/analytics/`)
- `GET /analytics/client/:id?datePreset=` → `DashboardOverview` (from PerformanceSnapshot)
- `GET /analytics/campaign/:id/timeseries?granularity=DAY`
- `POST /recommendations/generate` `{clientId}` → ANALYTICS+OPTIMIZATION agents → OptimizationRecommendation rows [recommendation.generate]
- `GET /recommendations?clientId=&status=` [recommendation.read]
- `POST /recommendations/:id/decide` `{decision: "ACKNOWLEDGED"|"APPLIED"|"DISMISSED"}` [recommendation.decide]

### agents module (`apps/api/src/agents/`)
- `AgentEngine` service: `run<TIn, TOut>(agentType, orgId, clientId, input, schema, promptBuilder)` — creates AgentRun (RUNNING), calls `AiProvider.complete`, stores output + sha256 input/output hashes + token counts, returns parsed output. On failure marks FAILED.
- `AiProviderFactory`: `AI_PROVIDER=mock` → `MockAiProvider`, else `AnthropicProvider`.
- Prompt builders per agent live in `apps/api/src/agents/prompts/<agent>.ts` — see marketing spec in docs/DESIGN.md.
- `GET /agent-runs?clientId=&agentType=` [analytics.read? use client.read] — list runs (no raw output for CLIENT_VIEWER).

## Web app (`apps/web`)

- Next.js App Router. `src/app/layout.tsx`: `<html lang="he" dir="rtl">`, Heebo font, global sidebar for authed routes via route group `(app)`, auth pages in `(auth)`.
- API access: `src/lib/api.ts` — fetch wrapper reading `NEXT_PUBLIC_API_URL`, attaches `Authorization: Bearer` from localStorage (`campaignos.accessToken`), auto-refresh on 401 once, redirects to `/login` on failure. Typed functions per endpoint returning shared types.
- Auth state: `src/lib/auth-store.ts` — localStorage session + React context provider `AuthProvider`.
- UI kit in `src/components/ui/`: `Button`, `Card`, `Input`, `Select`, `Textarea`, `Badge` (status chips with Hebrew labels from shared), `Modal`, `Table`, `Tabs`, `Spinner`, `EmptyState`, `Toast` (simple context), `StatCard`, `PageHeader`, `Stepper`.
- Pages (all Hebrew, RTL):
  - `(auth)/login`, `(auth)/register`
  - `(app)/dashboard` — agency overview
  - `(app)/clients` — list; `(app)/clients/new` — 5-step wizard; `(app)/clients/[id]` — tabs: סקירה, פרופיל מותג, פרסונות, חיבור Meta, קמפיינים
  - `(app)/campaigns` — all campaigns; `(app)/campaigns/new` — builder; `(app)/campaigns/[id]` — tabs: פרטים, אסטרטגיה, מודעות (generator), אישור ופרסום
  - `(app)/approvals` — Review & Approve + Launch Center
  - `(app)/analytics` — client selector + dashboard
  - `(app)/recommendations` — "מה לעשות עכשיו"
  - `(app)/settings` — org; `(app)/settings/team` — members; `(app)/activity` — audit log
- Sidebar order (Hebrew): לוח בקרה, לקוחות, קמפיינים, אישורים, אנליטיקס, המלצות, פעילות, הגדרות.
- Never render raw enum values — always map through `@campaignos/shared` Hebrew labels.

## File ownership map (builders)

- **api-auth-org**: `apps/api/src/auth/**`, `apps/api/src/org/**`, `apps/api/test/auth*.test.ts`, `apps/api/test/org*.test.ts`
- **api-clients**: `apps/api/src/clients/**`, `apps/api/test/clients*.test.ts`
- **api-meta**: `apps/api/src/meta/**`, `packages/meta/src/connectors/**`, `packages/meta/src/error-mapping.ts`, `packages/meta/src/__tests__/**`, `apps/api/test/meta*.test.ts`
- **api-campaigns**: `apps/api/src/campaigns/**`, `apps/api/test/campaigns*.test.ts`
- **api-agents-analytics**: `apps/api/src/agents/**`, `apps/api/src/analytics/**`, `packages/ai/src/providers/**`, `packages/ai/src/__tests__/**`, `apps/api/test/agents*.test.ts`
- **web-core**: `apps/web/src/app/layout.tsx`, `globals.css`, `(auth)/**`, `(app)/layout.tsx`, `(app)/dashboard/**`, `src/lib/**`, `src/components/ui/**`, `src/components/layout/**`
- **web-clients**: `(app)/clients/**`, `src/components/clients/**`
- **web-campaigns**: `(app)/campaigns/**`, `(app)/approvals/**`, `src/components/campaigns/**`
- **web-insights**: `(app)/analytics/**`, `(app)/recommendations/**`, `(app)/activity/**`, `(app)/settings/**`, `src/components/insights/**`
- **integrator (main session)**: `app.module.ts`, seed, README, docs, wiring fixes.

## Testing

- Vitest. API unit tests instantiate services directly (manual constructor injection with mocks) — do NOT use Nest `Test.createTestingModule` (decorator metadata unavailable under esbuild).
- Mock `PrismaService` with plain objects/`vi.fn()`. Mock connector = `MockMetaConnector` (deterministic fixtures).
- Every module ships at least: happy path + tenant-isolation test + RBAC test where relevant.
