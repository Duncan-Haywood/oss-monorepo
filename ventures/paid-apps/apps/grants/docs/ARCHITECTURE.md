# Grant Autopilot — Architecture (v0.1 draft)

Grant Autopilot finds grant opportunities, matches them to a nonprofit, drafts applications **grounded
only in the org's own sources**, routes them to the right level of human review, submits them and
tracks follow-ups. First tenant: Southwest Indian Foundation (Gallup, NM). Built multi-tenant from day one.

## Stack (all Cloudflare)

| Concern          | Choice                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| Runtime          | One Cloudflare Worker: Hono API at `/api/*` + static SPA assets + queue consumer + cron + Workflow                   |
| UI               | React 19 SPA, TanStack Router (code-based routes) + TanStack Query, Tailwind 4                                       |
| Relational data  | D1 (SQLite) via Drizzle ORM. Shared DB, every tenant row keyed by `org_id`, `ON DELETE CASCADE` from `organization`  |
| Files            | R2 bucket `FILES`, keys `orgs/{orgId}/...`                                                                           |
| Retrieval        | Vectorize index (namespace = orgId) + Workers AI embeddings (`@cf/baai/bge-m3`, 1024d)                               |
| Doc conversion   | Workers AI `toMarkdown` (PDF, DOCX, HTML, images)                                                                    |
| Speech-to-text   | Workers AI Whisper (`@cf/openai/whisper-large-v3-turbo`) for dictation / voice answers                               |
| LLM              | Claude (`claude-haiku-5-5` via `LLM_MODEL`, the cheapest model that does the job; see PRICING.md "Model") via `@anthropic-ai/sdk`, structured outputs, prompt caching, server-side refusal fallback on non-Haiku models; first party or Claude Platform on AWS (`LLM_PROVIDER`, SigV4 via WebCrypto) |
| Background jobs  | Cloudflare Queue `JOBS` (one queue, typed messages, DLQ)                                                             |
| Durable pipeline | Cloudflare Workflow `ApplicationPipeline` (draft → verify → route → wait for review → submit → follow-ups)           |
| Schedules        | Cron: daily discovery, every 30 min follow-ups                                                                       |
| Auth             | Better Auth (email+password, Google OAuth); our own org/member/invitation tables                         |
| Billing          | Merchant of record (adapter behind `BillingProvider` port), cost-plus plans                                          |
| IaC              | `wrangler.jsonc` (auto-provisions D1/R2/Queues) + `scripts/provision.mjs` (Vectorize) + GitHub Actions               |
| AWS (port)       | Same app on Lambda via the AWS SaaS starter: RDS Postgres, S3, EventBridge, Paddle via the payments sub-stack; OpenTofu in `infra/aws` (docs/AWS.md) |

## Code layout (`apps/grants`)

```
src/shared/            enums.ts, content.ts (draft/claim/grounding contracts), api/types.ts (DTOs), billing/
src/worker/
  index.ts             fetch + queue + scheduled + Workflow export
  app.ts               mounts routers (do not put logic here)
  context.ts           composition root: AppContext { env, db, llm, embedder, vectors, converter, transcriber, email, web, billing, logger, now, defer }
  env.ts / types.ts    bindings + Hono AppEnv (c.var.ctx, c.var.user, c.var.tenant)
  db/schema/*.ts       Drizzle schema, one file per domain
  ports/               interfaces for every external service + real adapters + fakes
                       (LLM: anthropic-llm, claude-on-aws, fallback-llm, budgeted-llm; email: resend-email,
                       cloudflare-email, ses-email, fallback-email; aws-sigv4; provider-switch = LLM_PROVIDER /
                       EMAIL_PROVIDER wiring used by context.ts)
  middleware/          context, security headers + Origin check, session, tenant (requireOrg/requireRole)
  routes/              public routers; routes/org/* are tenant-scoped under /api/orgs/:orgId
  services/<module>/   business logic: plain functions `(ctx: AppContext, ...)`; jobs.ts = queue handlers; fake-llm.ts = FakeLlm handlers
  queues/              messages.ts (job contract), handlers.ts (type -> handler), enqueue.ts, consumer.ts
  workflows/           application-pipeline.ts
src/client/            main.tsx, router.tsx, lib/ (api, query, cn), components/ui (primitives), components/layout, routes/**
test/worker/           integration tests in workerd (real local D1/R2/Queues/Workflows, fake externals)
test/unit/             node/happy-dom tests
test/e2e/              Playwright
evals/                 LLM quality + cost benchmarks (need ANTHROPIC_API_KEY)
```

## Anti-fabrication design (the core liability)

1. **Fact base.** Everything the system may assert about an org is an atomic `fact` with provenance
   (document chunk / interview turn / user), a verbatim `sourceQuote`, a status
   (`proposed` → `confirmed` | `rejected` | `superseded`) and a sensitivity level (`restricted` facts never
   reach drafting).
2. **Cited drafting.** The drafter receives only facts (+ retrieved chunks for style/context and top-rated past
   applications as style references). Output is structured (`ApplicationContent`): sections → paragraphs →
   claims; every `factual` claim lists `factIds`. Unanswerable questions become `gaps`, never invented text.
3. **Independent verification.** The grounding verifier (separate prompt, separate call) judges each factual
   claim against the cited facts' statements + quotes, AND runs deterministic checks: every number, date,
   dollar amount and percentage in a claim must appear in its cited facts; `framing` claims must contain no
   numbers / proper nouns / outcomes; citations to `proposed` facts are flagged.
4. **Flags → humans or interviews.** Unsupported claims and gaps become `application_flags`; gaps generate
   gap-fill interview questions. Status `needs_info` until resolved.
5. **Autopilot gates.** Auto-submit only if: org enabled autopilot, ask ≤ `autoSubmitMaxCents`, fit ≥ threshold,
   not high-likelihood, not first submission to this funder (if configured), monthly cap not exceeded,
   grounding `passed`, zero open blockers, all cited facts `confirmed`. Otherwise `one_click` or `full_review`.
6. **Immutable record.** Every draft is an `application_version`; every submission stores the exact package in
   R2 with its SHA-256; every consequential action writes `audit_log`.

## Tenancy & security rules

- Every tenant route lives under `/api/orgs/:orgId/*` behind `requireOrg()` (membership check, 404 on non-member).
  Writes add `requireRole("editor")`; settings/members/billing/privacy deletions require `admin`/`owner`.
- **Every query on a tenant table filters by `c.var.tenant.orgId`.** Never trust an `orgId` from a body. Lookups
  by id must also match `orgId` (`and(eq(t.id, id), eq(t.orgId, orgId))`).
- R2 keys always start with `orgs/{orgId}/`. Vectorize namespace = orgId.
- Opportunities are a global public catalog; rows with `privateToOrgId` are visible only to that org.
- No secrets or document contents in logs or queue messages. Hash IPs before storing.
- State-changing requests pass the Origin check (CSRF). Cookies: HttpOnly, Secure, SameSite=Lax.

## API conventions

- JSON. Lists: `{ items: T[], nextCursor? }`. Single resources: the object itself. Errors:
  `{ error: { code, message, details? } }` (throw `AppError` helpers from `lib/errors.ts`).
- Validate inputs with `validate(target, schema)` (`lib/validate.ts`, wraps `@hono/zod-validator`) + zod schemas. Response DTOs are the DB rows
  serialized (`src/shared/api/types.ts`), optionally with joined extras documented below.
- IDs are prefixed (`newId("doc")`). Money in integer cents. Timestamps are ISO strings in JSON.

### Endpoint contract (backend implements exactly; frontend consumes exactly)

Public / account

- `GET /api/health`
- `ALL /api/auth/*` — Better Auth (sign-up/in/out email+password, Google OAuth, session)
- `GET /api/me` → `{ user: {id,email,name}, memberships: [{ orgId, orgName, orgSlug, role }] }`
- `GET /api/legal` → `{ items: [{ key, title, version, updatedAt }] }`; `GET /api/legal/:key` (`terms|privacy|refunds|data-use|acceptable-use`) → `{ key, title, version, updatedAt, markdown }`
- `POST /api/billing/webhook` — provider webhook
- `GET /api/calendar/:token.ics` — public ICS feed; the 32-byte base64url token is the credential (only its SHA-256 is stored); unknown/revoked → 404; rate-limited per token
- `POST /api/newsletter/subscribe` `{ email, source, consentVersion, website? }` → 202 `{ ok, message }` (same answer for every address; double opt-in, rate-limited); `GET|POST /api/newsletter/confirm?token=` (GET redirects to the page; POST → `{ ok, status }`); `GET|POST /api/newsletter/unsubscribe?token=` and `GET|POST /api/email/unsubscribe?token=` (team notifications) — RFC 8058 one-click, no Origin/session. See docs/EMAIL_MARKETING.md
- `POST /api/orgs` `{ name, legalName, orgType, city?, state?, websiteUrl?, acceptTerms: true, policyVersion }` → `{ orgId }` (creates org, owner membership, profile, settings, consent records, comp/none subscription)
- `GET /api/orgs` → `{ items: [{ id, name, slug, role }] }`

Org (`/api/orgs/:orgId`)

- `GET /` → `{ org: {id,name,slug}, role, profile: OrgProfileDto, settings: OrgSettingsDto }`; `PATCH /profile`; `PATCH /settings` (admin; automation fields: ADR 0006); `GET /settings/automation-preview?automationLevel=&require…=true|false|null&twoPersonRuleAboveCents=` → `{ automation, presets, safetyRails, assumptions, examples: [{ key, label, amountCents, fitScore, likelihood, firstToFunder, tier, reasons, requiredApprovals, drafting }] }`
- `GET /members` → `{ items: [{ id, userId, name, email, role, createdAt }] }`; `POST /members/invitations` `{ email, role }` (admin); `GET /members/invitations`; `DELETE /members/invitations/:id`; `PATCH /members/:memberId` `{ role }`; `DELETE /members/:memberId`
- `POST /documents` multipart (`file`, `kind`, `title?`, `pastOutcome?`, `pastFunder?`, `pastAmountCents?`, `pastYear?`, `consent=true`) → `DocumentDto`; `POST /documents/text` `{ title, kind, text }` (paste); `GET /documents?kind=` → list; `GET /documents/:id` → `DocumentDto & { chunks: ChunkDto[], facts: FactDto[] }`; `GET /documents/:id/download`; `DELETE /documents/:id`; `POST /documents/:id/reprocess`
- `POST /search` `{ query, topK? }` → `{ items: [{ chunkId, documentId, documentTitle, text, score }] }`
- `GET /facts?status=&category=&q=` → list; `POST /facts` `{ category, statement, value?, asOf?, projectId?, sensitivity? }` (user_entered, auto-confirmed); `PATCH /facts/:id`; `POST /facts/:id/confirm`; `POST /facts/:id/reject`; `POST /facts/bulk-confirm` `{ ids }`; `GET /facts/summary` → `{ byStatus, byCategory, coverage: [{ topic, factCount, status: "missing"|"thin"|"good" }] }`
- `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id` (detail includes `facts`)
- `POST /interviews` `{ kind, mode?, focusProjectId?, focusApplicationId? }` → `InterviewDto & { turns }` (AI asks first question); `GET /interviews`; `GET /interviews/:id` → `InterviewDto & { turns: InterviewTurnDto[] }`; `POST /interviews/:id/answer` `{ content, inputMode }` → `{ turns: [respondentTurn, nextInterviewerTurn | null], done: boolean }`; `POST /interviews/:id/complete` (extracts facts); `POST /interviews/transcript` `{ title, text }` or multipart file → InterviewDto (facts extracted)
- `POST /transcribe` multipart `audio` → `{ text }`
- `GET /opportunities?q=&status=&closingWithinDays=` → `{ items: (OpportunityDto & { match: MatchDto | null })[] }`; `GET /opportunities/:id` → `OpportunityDto & { match: MatchDto | null }`
- `POST /imports/opportunity-url` `{ url }` → `OpportunityDto` (private to org); `POST /imports/rfp` multipart `file` → `OpportunityDto`; `POST /imports/website` `{ url, maxPages? }` → `{ queued: true }` (requires allowWebsiteCrawl)
- `GET /matches?status=&minFit=` → `{ items: (MatchDto & { opportunity: OpportunityDto })[] }` sorted by expectedValue; `POST /matches/rescore` → `{ queued: true }`; `PATCH /matches/:id` `{ status }`
- `POST /applications` `{ opportunityId, projectId? , requestedAmountCents? }` → `ApplicationDto` (starts pipeline); `GET /applications?status=` → `{ items: (ApplicationDto & { opportunity: {id,title,funderName,closeDate} })[] }`; `GET /applications/:id` → `ApplicationDto & { opportunity: OpportunityDto, currentVersion: ApplicationVersionDto | null, versions: {id,versionNumber,createdAt,authorType}[], flags: FlagDto[], citedFacts: FactDto[], submissions: SubmissionDto[] }`; `PATCH /applications/:id/sections/:sectionKey` `{ paragraphs }` (creates new version, re-verifies); `POST /applications/:id/regenerate` `{ sectionKey? }`; `POST /applications/:id/flags/:flagId/resolve` `{ resolution }`; `POST /applications/:id/withdraw`; `POST /applications/:id/outcome` `{ outcome: "awarded"|"declined", awardedAmountCents?, notes? }`; `GET /applications/:id/cost` → `{ costMicros, calls }`
- `GET /reviews/queue` → `{ items: (ApplicationDto & { opportunity, openBlockers, openWarnings })[] }`; `POST /reviews/:applicationId/decision` `{ decision, comments? }` (reviewer+; `approved` triggers submission = "one click"); `POST /reviews/:applicationId/feedback` `{ rating 1-5, comment?, sectionKey?, tags? }`; `GET /reviews/:applicationId/feedback`
- `GET /submissions` → `{ items: (SubmissionDto & { application: {id,title} })[] }`; `GET /submissions/:id/package` (the exact submitted package); `POST /submissions/:id/confirm` `{ externalRef? }` (mark manual submission done); `GET /submissions/followups?status=` → list; `PATCH /submissions/followups/:id` `{ status, notes? }`; `GET /submissions/dashboard` → `{ counts: { byStatus }, upcomingDeadlines, pendingReviews, awardedCents, submittedThisMonth, recentActivity }`
- `GET /privacy/consents`; `POST /privacy/consents` `{ scope, granted }`; `GET /privacy/audit-log?cursor=`; `POST /privacy/exports` → DataExportDto; `GET /privacy/exports/:id/download`; `DELETE /privacy/org` `{ confirmName }` (owner)
- `GET /calendar/tokens` → `{ items: CalendarTokenDto[] }` (own; admins: all); `POST /calendar/tokens` `{ scope: "org"|"mine" }` → `{ token, url, webcalUrl }` (201; the only time the URL is shown; `org` needs editor+); `DELETE /calendar/tokens/:id` (own, or admin); `GET /calendar/settings` → `{ includeAmounts }`; `PATCH /calendar/settings` (admin); `GET /opportunities/:id/calendar.ics` (one deadline, `text/calendar`)
- `GET /billing` → `{ subscription: SubscriptionDto | null, plan, usage: { periodKey, applicationDrafts, limit }, plans }`; `POST /billing/checkout` `{ planKey, promoCode? }` → `{ url }`; `POST /billing/portal` → `{ url }`

## Module ownership (parallel build)

Each agent owns its files exclusively. Shared foundation files (`app.ts`, `context.ts`, `router.tsx`,
`queues/*`, `db/schema/_columns.ts`, `shared/enums.ts`, `shared/content.ts`) change only via the integration pass —
if you need a change there, say so in your final report. Domain schema files may be extended by their owner
(add columns/tables; don't rename).

| Module                 | Owns                                                                                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| auth                   | `routes/auth.ts`, `routes/me.ts`, `routes/org/members.ts`, `middleware/session.ts`, `services/auth/**`, `db/schema/auth.ts`, `test/worker/helpers.ts` (add helpers)                                                          |
| orgs                   | `routes/orgs.ts`, `routes/org/profile.ts`, `services/orgs/**`, `db/schema/org.ts`                                                                                                                                            |
| ingestion              | `routes/org/documents.ts`, `services/ingestion/**`, `ports/workers-ai.ts` (embedder+converter)                                                                                                                               |
| retrieval              | `routes/org/search.ts`, `services/retrieval/**`, `ports/vectorize-store.ts`                                                                                                                                                  |
| knowledge              | `routes/org/facts.ts`, `routes/org/projects.ts`, `services/knowledge/**`, `db/schema/knowledge.ts` (facts/projects)                                                                                                          |
| interview              | `routes/org/interviews.ts`, `routes/org/transcribe.ts`, `services/interview/**`, `db/schema/interviews.ts`, WorkersAiTranscriber                                                                                             |
| discovery              | `routes/org/opportunities.ts`, `routes/internal.ts`, `services/discovery/**`, `db/schema/opportunities.ts`                                                                                                                   |
| imports                | `routes/org/imports.ts`, `services/imports/**`, `ports/polite-fetcher.ts`                                                                                                                                                    |
| matching               | `routes/org/matches.ts`, `services/matching/**`                                                                                                                                                                              |
| drafting               | `services/drafting/**`                                                                                                                                                                                                       |
| grounding              | `services/grounding/**`                                                                                                                                                                                                      |
| pipeline               | `routes/org/applications.ts`, `routes/org/reviews.ts`, `services/pipeline/**`, `services/review/**`, `workflows/**`, `db/schema/applications.ts`                                                                             |
| submission             | `routes/org/submissions.ts`, `services/submission/**`, `ports/resend-email.ts`, `ports/cloudflare-email.ts`, `ports/ses-email.ts`, `ports/fallback-email.ts`, `db/schema/submissions.ts`                                                                                                                   |
| privacy+legal          | `routes/legal.ts`, `routes/org/privacy.ts`, `services/privacy/**`, `services/legal/**`, `db/schema/privacy.ts`, `docs/legal/**`                                                                                              |
| billing                | `routes/billing-webhook.ts`, `routes/org/billing.ts`, `services/billing/**`, `ports/billing-providers.ts`, `ports/billing/**`, `src/shared/billing/**`, `db/schema/billing.ts`, `evals/cost-benchmark.ts`, `docs/PRICING.md` |
| ui shell               | `components/ui/**`, `components/layout/**`, `routes/public/**`, `lib/auth-client.ts`, `styles.css`, `public/**`                                                                                                              |
| ui onboarding+settings | `routes/onboarding/**`, `routes/org/settings/**`                                                                                                                                                                             |
| ui knowledge           | `routes/org/knowledge/**`, `routes/org/projects/**`                                                                                                                                                                          |
| ui interview           | `routes/org/interviews/**`, `components/voice/**`                                                                                                                                                                            |
| ui grants              | `routes/org/dashboard.tsx`, `routes/org/opportunities/**`                                                                                                                                                                    |
| ui applications        | `routes/org/applications/**`, `routes/org/reviews/**`, `routes/org/submissions/**`, `components/application/**`                                                                                                              |
| infra                  | `.github/**`, `scripts/**`, `docs/DEPLOY.md`, `services/demo/**` (seed)                                                                                                                                                      |
| aws runtime            | `src/worker/aws/**`, `migrations-pg/**`, `scripts/aws/**`, `infra/aws/**`, `services/billing/entitlement-sync.ts`, `docs/AWS.md` (the AWS SaaS starter port: same app, Postgres/S3/Lambda adapters)                         |
| e2e                    | `test/e2e/**`, `playwright.config.ts`                                                                                                                                                                                        |

## Testing strategy

- **Unit** (`pnpm test:unit`, Node): pure logic — chunking, numeric grounding checks, routing policy, plan
  margins, prompt builders. Co-locate as `*.test.ts` next to the code.
- **Worker integration** (`pnpm test:worker`, workerd): routes end-to-end with real local D1/R2/Queues and fake
  externals; tenant isolation tests for every router. Co-locate as `*.worker.test.ts` or put in `test/worker/`.
- **E2E** (`pnpm test:e2e`, Playwright, `FAKE_EXTERNALS=true`): the demo flow in a real browser.
- **Evals** (`pnpm eval`, real Claude): drafting faithfulness + cost per application on a synthetic org.
