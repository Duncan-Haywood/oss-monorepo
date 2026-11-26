# Modules

This is a map of each backend service module and each UI area, taken from the code on 2026-11-19 at about
17:40 UTC. The code is changing fast during the parallel build, so check `index.ts` and `app.ts` when
something here looks wrong. The ownership rules are in [ARCHITECTURE.md](ARCHITECTURE.md#module-ownership-parallel-build),
the terms in [GLOSSARY.md](GLOSSARY.md), and how to add a module in [../CONTRIBUTING.md](../CONTRIBUTING.md).

Conventions:

- **Public functions** are the function exports of `src/worker/services/<module>/index.ts`. Other
  modules should import only these. Exported constants and zod schemas are listed separately.
  Where a router imports from a module's internal file instead, the import is listed under **Also
  used by routes**.
- **Routes:** paths under `/api/orgs/:orgId` are written as `org:/path`.
- **Jobs** are `JobMessage` types (`src/worker/queues/messages.ts`) mapped to handlers in
  `queues/handlers.ts`.
- **LLM purposes** are the `purpose` keys passed to `ctx.llm`. Each one has a FakeLlm handler in the
  module's `fake-llm.ts`.
- **Tables** are the tables the module writes. The Drizzle schema file is in brackets.

## Backend foundation (not modules)

| Piece | Files | Notes |
| --- | --- | --- |
| Entry points | `index.ts`, `app.ts`, `scheduled.ts` | `fetch` / `queue` / `scheduled` / `ApplicationPipeline`. `app.ts` only mounts routers. Crons: `17 13 * * *` enqueues `discovery.run` (grants_gov, plus simpler_grants if a key is set) and `privacy.retention_sweep`. `*/30 * * * *` enqueues `followups.run_due`. |
| Composition root | `context.ts`, `env.ts`, `types.ts` | `AppContext { env, db, llm, embedder, vectors, converter, transcriber, email, web, billing, logger, now, defer }`. LLM usage is written to `llm_calls` by the `onUsage` hook. |
| Queues | `queues/messages.ts`, `handlers.ts`, `enqueue.ts`, `consumer.ts` | One queue, 12 job types, retries with exponential delay up to 300 s, then the DLQ. `enqueue()` runs inline in tests and when `INLINE_JOBS=true`. |
| Workflow | `workflows/application-pipeline.ts` | The durable application lifecycle. Its steps are in `services/pipeline/steps.ts`. |
| Middleware | `middleware/observability.ts`, `context.ts`, `security.ts`, `request-limits.ts`, `rate-limit.ts`, `session.ts`, `tenant.ts` | In mount order: access log with `x-request-id`, context, security headers, body size and JSON content-type caps, Origin check, `authLimiter` on `/api/auth/*`, session, then on the org router `requireOrg("viewer")` with `llmLimiter` and `uploadLimiter`. The limiters use the Workers Rate Limiting bindings `AUTH_LIMITER`, `LLM_LIMITER` and `UPLOAD_LIMITER`, and fall back to an in-memory counter. `requireRole(minRole)` handles writes. |
| Ports | `ports/*.ts` | `llm.ts` with `anthropic-llm.ts`, `fake-llm.ts` and `budgeted-llm.ts`. In real mode the Anthropic client is wrapped in `BudgetedLlm`, and with no `ANTHROPIC_API_KEY` every call fails with 503 `llm_not_configured`. There is no silent fake; `embedder.ts`, `vector-store.ts`, `document-converter.ts`, `transcriber.ts` (Workers AI and Vectorize adapters); `email.ts` (`cloudflare-email.ts` for transactional mail, `resend-email.ts`; chosen in `context.ts`, docs/EMAIL.md); `web-fetcher.ts` (`polite-fetcher.ts`); `billing-provider.ts` (`billing/paddle.ts`, `billing/fake.ts`). Fakes are in `fakes.ts`. |
| Ops telemetry | `db/schema/ops.ts` | `llm_calls`, written by `context.ts`, read by billing and guards. |
| Infra routes | `routes/health.ts`, `routes/demo.ts` | `GET /api/health` returns `{ ok, env, fake }`. The `/api/demo` router is **empty**: `POST /api/demo/seed` and `services/demo/**` are not built yet. |

## Backend service modules

### auth

- **Responsibility:** identity and sessions (Better Auth), org membership, roles and invitations (our
  own tables, ADR 0008).
- **Public functions:** `deleteAccount`, `orgsWhereLastOwner`, `authOptionsForRequest`, `createAuth`,
  `isHardened`, `requiresEmailVerification`, `escapeHtml`, `acceptInvitation`, `changeMemberRole`,
  `createInvitation`, `getMyInvitation`, `invitationId`, `listInvitations`, `listMembers`,
  `listMemberships`, `listMyInvitations`, `memberId`, `removeMember`, `revokeInvitation`,
  `hashPassword`, `verifyPassword`, `listSessions`, `revokeOtherSessions`, `revokeSession`,
  `summarizeUserAgent`, `truncateIp`. Constants: `REAUTH_WINDOW_MS`, `EMAIL_VERIFICATION_TTL_SECONDS`,
  `MIN_PASSWORD_LENGTH`, `RESET_PASSWORD_TTL_SECONDS`, `TEST_REQUIRE_EMAIL_VERIFICATION_HEADER`,
  `EMAIL_THROTTLE`, `INVITATION_TTL_MS`.
- **Routes:** `GET|POST /api/auth/*`; `GET /api/me`, `DELETE /api/me` (delete account),
  `GET /api/me/invitations`, `GET /api/me/invitations/:id`, `POST /api/me/invitations/:id/accept`,
  `GET /api/me/sessions`, `POST /api/me/sessions/revoke-others`, `DELETE /api/me/sessions/:id`; `org:/members` (`GET /`,
  `GET|POST /invitations`, `DELETE /invitations/:id`, `PATCH|DELETE /:memberId`). Also
  `middleware/session.ts`.
- **Jobs:** none. **LLM purposes:** none.
- **Tables:** `user`, `session`, `account`, `verification` (written by Better Auth), `member`,
  `invitation` [`auth.ts`]. The `organization` root is in the same file but is written by orgs and privacy.

### orgs

- **Responsibility:** create an org (owner membership, profile, settings, consents) and read or update
  its profile and settings. Builds the org's profile text for prompts.
- **Public functions:** `buildPromptProfile`, `createOrg`, `getOrgOverview`, `getOrgProfile`,
  `getOrgPromptProfile`, `getOrgSettings`, `listUserOrgs`, `updateOrgProfile`, `updateOrgSettings`,
  `slugify`. Schemas and constants: `createOrgSchema`, `profilePatchSchema`, `settingsPatchSchema`,
  `ORG_TYPE_LABELS`, `PROMPT_PROFILE_HEADER`.
- **Also used by routes:** `validate.ts#jsonBody`.
- **Routes:** `POST /api/orgs`, `GET /api/orgs`, `GET /api/orgs/:orgId/` (trailing slash, in
  `routes/orgs.ts`); `org:GET /`, `PATCH /profile`, `PATCH /settings` (admin).
- **Jobs:** none. **LLM purposes:** none.
- **Tables:** `organization` (on create), `member` (owner row), `org_profiles`, `org_settings`
  [`org.ts`], `consent_records` (settings toggles that are also consents).

### ingestion

- **Responsibility:** document upload and paste, storage in R2 (`orgs/{orgId}/documents/…`),
  conversion to markdown, chunking, embedding into Vectorize, reprocessing and deletion.
- **Public functions:** `chunkMarkdown`, `estimateTokens`, `createDocument`, `createDocumentFromText`,
  `deleteDocument`, `documentPrefix`, `getDocument`, `getDocumentDetail`, `getDocumentText`,
  `listDocuments`, `reprocessDocument`, `resolveMimeType`. Constants: `DEFAULT_CHUNK_OPTIONS`,
  `MAX_TEXT_CHARS`, `MAX_UPLOAD_BYTES`.
- **Also used by routes:** `documents.ts#isOriginalPurged`, `#originalUnavailable`; `files.ts`
  helpers (`ALLOWED_EXTENSIONS`, `contentDisposition`, `extensionForMime`, `titleFromFilename`).
- **Routes:** `org:/documents` (`GET /`, `POST /` multipart, `POST /text`, `GET /:id`,
  `GET /:id/download`, `DELETE /:id`, `POST /:id/reprocess`).
- **Jobs:** `document.process` → `jobs.ts#processDocument`, which then enqueues
  `facts.extract_document`.
- **LLM purposes:** none. It uses `ctx.converter` and `ctx.embedder`.
- **Tables:** `documents`, `document_chunks` [`knowledge.ts`]; also deletes dependent `facts`.

### retrieval

- **Responsibility:** hybrid search over an org's chunks (Vectorize similarity plus BM25, combined with
  reciprocal rank fusion), and style examples from past applications for drafting.
- **Public functions:** `retrieveChunks`, `retrieveStyleExamples`, `formatChunksForPrompt`, `bm25`,
  `queryTerms`, `reciprocalRankFusion`, `stem`, `tokenize`. Constants: `DEFAULT_TOP_K`,
  `KEYWORD_SCAN_LIMIT`.
- **Routes:** `org:POST /search`.
- **Jobs:** none. **LLM purposes:** none. **Tables:** none (reads `document_chunks`, `documents`).

### knowledge

- **Responsibility:** the fact base (proposed, confirmed, rejected, superseded), fact extraction from
  documents and interviews, coverage checklist, projects, and the fact formatting used in prompts.
- **Public functions:** `computeCoverage`, `acceptExtractedFacts`, `confirmFact`, `createUserFact`,
  `getCoverage`, `getFact`, `getFactsByIds`, `getFactsForDrafting`, `getFactsSummary`, `listFacts`,
  `formatFactsForPrompt`, `extractDocumentFactsFor`, `extractInterviewFactsFor`, `getProject`,
  `getProjectDetail`, `listProjects`, `normalizeForMatch`, `quoteInText`. Class `StatementIndex`.
  Constants: `KNOWLEDGE_CHECKLIST`, `PURPOSE_EXTRACT_DOCUMENT`, `PURPOSE_EXTRACT_INTERVIEW`.
- **Also used by routes:** `facts.ts#bulkConfirmFacts`, `#rejectFact`, `#updateFact`;
  `projects.ts#createProject`, `#updateProject`, `#deleteProject`.
- **Routes:** `org:/facts` (`GET /`, `GET /summary`, `POST /`, `POST /bulk-confirm`, `GET /:id`,
  `PATCH /:id`, `POST /:id/confirm`, `POST /:id/reject`); `org:/projects` (`GET /`, `POST /`,
  `GET|PATCH|DELETE /:id`).
- **Jobs:** `facts.extract_document` → `extractDocumentFacts`; `facts.extract_interview` →
  `extractInterviewFacts`.
- **LLM purposes:** `knowledge.extract_facts`, `knowledge.extract_interview_facts`.
- **Tables:** `facts`, `projects` [`knowledge.ts`]; updates extraction status on `documents` and
  `interviews`.

### interview

- **Responsibility:** AI interviews (onboarding, follow-up, project, gap-fill), transcript import,
  dictation and speech-to-text. When an interview completes, fact extraction is enqueued.
- **Public functions:** `audioKeyPrefix`, `transcribeAudio`, `answerInterview` (also exported as
  `answer`), `completeInterview`, `createGapFillInterview`, `getInterview`, `importTranscript`,
  `listInterviews`, `startInterview`, `parseTranscript`. Constant: `MAX_AUDIO_BYTES`.
- **Routes:** `org:/interviews` (`GET /`, `POST /`, `POST /transcript`, `GET /:id`,
  `POST /:id/answer`, `POST /:id/complete`); `org:POST /transcribe`.
- **Jobs:** produces `facts.extract_interview`. Handles none.
- **LLM purposes:** `interview.next_question`, `interview.summary`, `interview.project_fields`.
- **Tables:** `interviews`, `interview_turns` [`interviews.ts`]; `projects` (fields captured in a
  project interview).

### discovery

- **Responsibility:** the global opportunity catalog: Grants.gov ingestion (or the sample catalog in
  fake mode), funders, discovery runs, parsing requirements from RFPs, and org-visible listing with
  matches.
- **Public functions:** `getOpportunity`, `listOpportunities`, `confirmSubmissionEmail`, `ensureRequirements`,
  `standardSections`, `discoveryQueries`, `enqueueRescoreAllOrgs`, `listDiscoveryRuns`,
  `runDiscoveryForSource`, `runGrantsGovDiscovery`, `runSampleDiscovery`, `seedSampleOpportunities`,
  `visibleTo`. Constants: `DEFAULT_QUERIES`, `SAMPLE_OPPORTUNITIES`.
- **Routes:** `org:GET /opportunities`, `org:GET /opportunities/:id`,
  `org:POST /opportunities/:id/confirm-submission-email`; internal (bearer
  `INTERNAL_API_TOKEN`): `POST /api/internal/discovery/run`, `GET /api/internal/discovery/runs`,
  `POST /api/internal/discovery/seed-samples`.
- **Jobs:** `discovery.run` → `runDiscovery`, which then enqueues `matching.score_org` for every org;
  `opportunity.parse_requirements` → `parseRequirements`.
- **LLM purposes:** `discovery.parse_requirements`.
- **Tables:** `funders`, `opportunities`, `discovery_runs` [`opportunities.ts`].

### imports

- **Responsibility:** importing an opportunity from a URL or an uploaded RFP as a private opportunity,
  and crawling the org's own website politely (robots.txt, SSRF-safe URLs, consent required).
- **Public functions:** `parsePublicUrl`, `normalizeUrl`, `registrableDomain`, `looksNonHtml`,
  `rfpMimeType`, `importOpportunityFromUrl`, `importRfpFile`, `assertWebsiteCrawlAllowed`,
  `requestWebsiteCrawl`, `crawlOrgWebsite`, `unprocessable`. Constants: `MAX_RFP_BYTES`,
  `MAX_CRAWL_PAGES`.
- **Routes:** `org:/imports` (`POST /opportunity-url`, `POST /rfp`, `POST /website`).
- **Jobs:** `website.crawl` → `crawlWebsite`; `opportunity.import_url` → `importOpportunityUrl`.
- **LLM purposes:** `imports.extract_opportunity`.
- **Tables:** `opportunities` (rows with `private_to_org_id`); crawled pages become `documents` through
  ingestion.

### matching

- **Responsibility:** scoring opportunities for an org (prefilter, then the LLM fit and likelihood
  judgment, then deterministic post-processing into expected value), match status, and autopilot
  drafting of the best matches.
- **Public functions:** `requestScoreOrg`, `runAutopilotDrafting`, `listMatches`, `updateMatchStatus`,
  `applicantCompatibility`, `classifyApplicantType`, `geographyCompatibility`, `prefilter`,
  `scoreOrgMatches`, `finalizeScore`. Constants and schemas: `AUTODRAFT_MIN_DAYS_TO_DEADLINE`,
  `AUTODRAFT_MIN_FIT`, `USER_MATCH_STATUSES`, `MAX_LLM_SCORES_PER_RUN`, `RESCORE_AFTER_DAYS`,
  `MATCH_SCORE_PURPOSE`, `MatchScoreOutput`.
- **Routes:** `org:/matches` (`GET /`, `POST /rescore`, `PATCH /:id`).
- **Jobs:** `matching.score_org` → `scoreOrg`.
- **LLM purposes:** `matching.score`.
- **Tables:** `opportunity_matches` [`opportunities.ts`]. Starts `applications` through
  `pipeline.createApplication`.

### drafting

- **Responsibility:** the cited application writer. It makes one LLM call per requirement section
  (two at a time) using only usable facts, then post-processes the result deterministically and writes
  a reviewer summary from the drafted claims. No routes.
- **Public functions:** `draftApplication`, `redraftSection`, `requirementSections`, `usableFacts`,
  `countWords`, `countWordsInText`, `renderPlainText`, `renderSectionText`. Constants:
  `DEFAULT_SECTIONS`, `PROMPT_VERSION`, `REQUESTED_AMOUNT_REF`.
- **Routes:** none (called by pipeline). **Jobs:** none.
- **LLM purposes:** `drafting.section`, `drafting.summary`.
- **Tables:** none (reads `facts`, `feedback`, `projects`; retrieval provides style examples).

### grounding

- **Responsibility:** the independent verifier (ADR 0005): deterministic number, framing and name
  checks plus an LLM entailment judge. Returns a `GroundingReport` and new flags. A pure library with
  no routes or tables.
- **Public functions:** `checkClaimNumbers`, `checkFramingClaim`, `deriveOrgNames`, `factNumericPool`,
  `factStartYears`, `factText`, `findNumberMismatches`, `approxMatches`, `approxSatisfied`,
  `expandFactTokens`, `extractNumericTokens`, `factValueTokens`, `spanMatchesStartYear`,
  `tokenMatches`, `tokenText`, `computeReport`, `countWords`, `numberMismatchMessage`,
  `requestedAmountFact`, `sectionText`, `verifyDraft`. Constants:
  `LlmVerdicts`, `PROMPT_VERSION`, `VERIFY_PURPOSE`, `VERIFY_SYSTEM`.
- **Routes:** none. **Jobs:** none.
- **LLM purposes:** `grounding.verify_claims`.
- **Tables:** none. Pipeline stores the report on `application_versions` and the flags in
  `application_flags`.

### pipeline

- **Responsibility:** the application lifecycle: create, prepare, draft, verify, wait for missing
  information, route, wait for review, submit. It runs as a Workflow, or inline in tests and the demo.
  Also editing, regeneration, flag resolution, withdrawal and recording outcomes.
- **Public functions:** `runsInline`, `createApplication`, `runPipelineInline`, `resumeAfterInfo`,
  `submitReviewDecision`, `redraftForChanges`, `editSection`, `regenerate`, `resolveFlag`,
  `withdrawApplication`, `recordOutcome`, `applicationCost`, `loadApplication`, `stepDraft`,
  `stepPrepare`, `stepRoute`, `stepSubmit`, `stepVerify`. Schemas: `InfoProvidedPayload`,
  `ReviewDecisionPayload`, `SectionEdit`, `OutcomeInput`.
- **Also used by routes:** `queries.ts#listApplications`, `#getApplicationDetail`.
- **Routes:** `org:/applications` (`POST /`, `GET /`, `GET /:id`, `GET /:id/cost`,
  `PATCH /:id/sections/:sectionKey`, `POST /:id/regenerate`, `POST /:id/flags/:flagId/resolve`,
  `POST /:id/withdraw`, `POST /:id/outcome`); `org:POST /reviews/:applicationId/decision`
  (reviewer+).
- **Jobs:** none. It is the `ApplicationPipeline` Workflow (events `info_provided` and
  `review_decision`).
- **LLM purposes:** none of its own (calls drafting and grounding).
- **Tables:** `applications`, `application_versions`, `application_flags`, `reviews`
  [`applications.ts`]; updates `opportunity_matches.status`.

### review

- **Responsibility:** the review-tier policy (pure, ADR 0006), the review queue, and reviewer feedback
  that steers later drafts.
- **Public functions:** `reviewQueue`, `addFeedback`, `listFeedback`, `decideReviewTier`. Schema:
  `FeedbackInput`.
- **Routes:** `org:GET /reviews/queue`, `org:POST /reviews/:applicationId/feedback`,
  `org:GET /reviews/:applicationId/feedback`.
- **Jobs:** none. **LLM purposes:** none.
- **Tables:** `feedback` [`applications.ts`].

### submission

- **Responsibility:** building the immutable submission package (JSON and markdown in
  `orgs/{orgId}/submissions/{id}/`, with SHA-256), choosing the channel (email, or manual, which is
  always used for Grants.gov), sending, confirming, follow-ups and deadline reminders, and the
  dashboard.
- **Public functions:** `submitApplication`, `confirmSubmission`, `scheduleDeadlineReminders`,
  `funderSubject`, `funderCoverNote`, `buildManualGuide`, `selectChannel`, `buildSubmissionPackage`,
  `countWords`, `renderPackageMarkdown`, `renderSectionText`, `serializePackage`, `packageKeys`,
  `isEmail`. Constant: `TERMINAL_STATUSES`.
- **Also used by routes:** `dashboard.ts#getDashboard`; `followups.ts#listFollowups`,
  `#updateFollowup`.
- **Routes:** `org:/submissions` (`GET /`, `GET /dashboard`, `GET /followups`,
  `PATCH /followups/:id`, `GET /:id`, `GET /:id/package`, `POST /:id/confirm`).
- **Jobs:** `followups.run_due` → `runDueFollowups`.
- **LLM purposes:** none (the package is never generated text).
- **Tables:** `submissions`, `followups` [`submissions.ts`]; updates `applications.status` and
  `opportunity_matches.status`.

### privacy (no `index.ts`; import from the files below)

- **Responsibility:** consents, the append-only audit log, full org export, real org deletion, and the
  retention sweep (DATA_POLICY.md).
- **Exports by file:** `audit.ts#audit`; `audit-log.ts#listAuditLog`, `encodeCursor`, `decodeCursor`;
  `consents.ts#recordConsent`, `listConsents`, `hasConsent`, `hashIp`, `clientMeta`,
  `isOrgLevelScope`, `canSetScope`, `ORG_LEVEL_SCOPES`; `export.ts#buildOrgExport`;
  `deletion.ts#deleteOrganizationData`; `retention.ts#runRetentionSweep`;
  `tenant-tables.ts#tenantTables`; `r2.ts#listKeys`, `deleteKeys`, `orgPrefix`, `exportKey`;
  `jobs.ts#exportOrg`, `deleteOrg`, `retentionSweep`, `EXPORT_TTL_MS`.
- **Routes:** `org:/privacy` (`GET|POST /consents`, where org-level scopes need admin+;
  `GET /audit-log`, `GET|POST /exports`, `GET /exports/:id` and `GET /exports/:id/download`, all
  admin+; `DELETE /org`, owner only).
- **Jobs:** `privacy.export_org` → `exportOrg`; `privacy.delete_org` → `deleteOrg`;
  `privacy.retention_sweep` → `retentionSweep`.
- **LLM purposes:** none.
- **Tables:** `consent_records`, `audit_log`, `data_exports`, `purged_files` [`privacy.ts`]; deletes
  every tenant table and `organization`. (`routes/org/privacy.ts` inserts `data_exports` rows itself.)

### legal

- **Responsibility:** serves the bundled legal documents. Their source is `docs/legal/*.md`, and
  `documents.ts` is generated by `node docs/legal/sync-documents.mjs`.
- **Public functions:** `listLegalDocs`, `getLegalDoc`.
- **Routes:** `GET /api/legal`, `GET /api/legal/:key`.
- **Jobs / LLM purposes / tables:** none.

### billing

- **Responsibility:** subscriptions through the merchant of record, quota checks, usage metering, cost
  per application, comp grants and webhook application (ADR 0007, PRICING.md).
- **Public functions:** `getSubscription`, `currentPeriodKey`, `getEntitlement`, `assertCanDraft`,
  `remainingOpportunityScores`, `recordUsage`, `getUsageSummary`, `applicationCost`,
  `applicationCostMicros`, `grantComp`, `applyBillingEvent`, `upsertProviderSubscription`. Constant:
  `DRAFTABLE_STATUSES`.
- **Routes:** `POST /api/billing/webhook` (signature-verified, outside the session); `org:/billing`
  (`GET /`, `POST /checkout` and `POST /portal` (admin+)).
- **Jobs:** none. **LLM purposes:** none.
- **Tables:** `subscriptions`, `usage_events`, `billing_events` [`billing.ts`].

### guards (no `index.ts`)

- **Responsibility:** LLM spend caps: a monthly cap per org (`ORG_MONTHLY_LLM_CAP_USD`, default 25)
  and a global daily kill switch (`GLOBAL_DAILY_LLM_CAP_USD`, default 200). The `BudgetedLlm`
  decorator in `context.ts` applies them to every real LLM call: 402 `llm_budget_exceeded` when the
  org cap is hit, 429 `llm_capacity_exhausted` when the global cap is hit.
- **Exports (`llm-budget.ts`):** `budgetConfigFromEnv`, `d1SpendSource`, `createLlmBudgetGuard`,
  `usdToMicros`, `isNonRetryableError`, `startOfUtcMonth`, `startOfUtcDay`; classes
  `BudgetExceededError`, `SpendCache`, `LlmBudgetGuard`.
- **Routes / jobs / LLM purposes / tables:** none (reads `llm_calls`).

### In progress: built but not wired yet

These modules have services, tests and routers, but `app.ts` doesn't mount their routers. Their schema
files are not exported from `db/schema/index.ts`, so they are missing from `drizzle-kit export`,
migrations and `tenantTables()` export and deletion. Their FakeLlm handlers are not in
`ports/fake-llm-handlers.ts`, and their jobs are not in `queues/messages.ts`. Wire them in the
integration pass.

| Module | Responsibility | Public functions (`index.ts`) | Router (unmounted) | LLM purpose | Tables (schema file) |
| --- | --- | --- | --- | --- | --- |
| **prospecting** | Foundation prospects from ProPublica Nonprofit Explorer (990 data; sample set offline), scored for fit | `buildProspects`, `deriveSearchParams`, `rankCandidates`, `normalizeEin`, `organizationUrl`, `parseOrganizationResponse`, `parseSearchResponse`, `searchUrl`, `getProspectDetail`, `latestProspectRun`, `listProspects`, `requestProspectRefresh`, `runProspectRefresh`, `updateProspect`, `finalizeProspectScore`, `searchFoundations`; class `ProPublicaClient` | `routes/org/prospects.ts`: `GET /`, `POST /refresh`, `GET /:id`, `PATCH /:id` | `prospecting.score` | `funder_profiles`, `org_prospects`, `prospect_runs` (`prospects.ts`) |
| **watchlist** | Watching funder pages and RSS feeds for new opportunities (conditional polite fetch, change detection) | `isPlatformAdmin`, `inferKind`, `clampInterval`, `toDto`, `listSources`, `getSourceForOrg`, `createSource`, `updateSource`, `deleteSource`, `requestManualCheck`, `listEvents`, `backoffHours`, `checkSource`, `runDueChecks`, `snapshotKey`, `fetchPageConditional`, `supportsConditional`, `watchFetcher`; class `ConditionalPoliteFetcher` | `routes/org/watchlist.ts`: `GET /`, `GET /events`, `POST /`, `PATCH /:id`, `DELETE /:id`, `POST /:id/check` | `watchlist.detect_opportunities` | `watch_sources`, `watch_events` (`watchlist.ts`) |
| **eligibility** (no `index.ts`) | Structured eligibility criteria for each opportunity, and a per-org assessment (deterministic checks first, then the LLM) | `service.ts`: `extractCriteria`, `toEligibilityProfile`, `checkEligibility`, `getEligibility`, `ensureEligibility`; `assess.ts`: prompt builders, `validateAssessments`, `missingInfoQuestions`, `overallVerdict` | none | `eligibility.extract_criteria`, `eligibility.assess` | `opportunity_criteria`, `org_eligibility` (`eligibility.ts`) |
| **discovery** (additions) | LLM-planned search queries and sweeps (`plans.ts`, `sweep.ts`, `codes.ts`) | — | — | `discovery.plan_queries` | `discovery_plans` (`discovery-plans.ts`) |

### Job → module index

| Job | Module | Handler |
| --- | --- | --- |
| `document.process` | ingestion | `processDocument` |
| `facts.extract_document`, `facts.extract_interview` | knowledge | `extractDocumentFacts`, `extractInterviewFacts` |
| `website.crawl`, `opportunity.import_url` | imports | `crawlWebsite`, `importOpportunityUrl` |
| `discovery.run`, `opportunity.parse_requirements` | discovery | `runDiscovery`, `parseRequirements` |
| `matching.score_org` | matching | `scoreOrg` |
| `followups.run_due` | submission | `runDueFollowups` |
| `privacy.export_org`, `privacy.delete_org`, `privacy.retention_sweep` | privacy | `exportOrg`, `deleteOrg`, `retentionSweep` |

## UI areas (`src/client`)

Routes are wired in `router.tsx`. Org pages are children of `/orgs/$orgId` (`OrgLayout`). Shared
client plumbing: `lib/api.ts` (`api`, `orgApi`, `ApiError`), `lib/query.ts` (`queryClient`),
`lib/session.ts` (`useMe`, `useCurrentOrg`, `hasRole`, `signOut`), `lib/auth-client.ts`, `lib/cn.ts`.

### ui shell

- **Pages:** `/` `LandingPage` (built from `components/marketing/**`: `Hero`, `Problem`,
  `HowItWorks`, `DraftPreview`, `Trust`, `Privacy`, `PricingSection`, `Faq`, `MarketingFooter`), `/login` `LoginPage`, `/signup` `SignupPage`, `/legal/$doc`
  `LegalPage`, `/invite/$invitationId` `AcceptInvitePage`; `NotFoundPage` (router default)
  [`routes/public/**`]. `auth-shared.tsx` holds `AuthCard`, `PasswordInput`, `GoogleButton`.
- **Components:** `components/ui/**`, the primitives exported from `components/ui/index.tsx`:
  `Button`, `Card*`, form controls (`Input`, `Textarea`, `Select`, `Checkbox`, `Switch`, `Field`),
  `Badge`, `StatusBadge`, `Alert`, `Spinner`, `EmptyState`, `PageHeader`, `Table`, `Dialog`,
  `ConfirmDialog`, `Tabs`, `Tooltip`, `Popover`, `Menu`, `FileDrop`, `Markdown`, `Progress`, `Meter`,
  `Stat`, `Skeleton*`, `ToastProvider`/`useToast`. Layout lives in `components/layout/**`:
  `PublicLayout`, `OrgLayout` (org navigation), `Logo`, `HrefLink`, `NotFound`.

### ui onboarding + settings

- **Pages:** `/onboarding` `OnboardingPage` with the steps `OrganizationStep`, `DocumentsStep`,
  `ProjectsStep`, `InterviewStep`, `AutopilotStep` [`routes/onboarding/**`];
  `/orgs/$orgId/settings/general` `GeneralSettingsPage`, `/settings/members` `MembersSettingsPage`,
  `/settings/autopilot` `AutopilotSettingsPage`, `/settings/privacy` `PrivacySettingsPage`,
  `/settings/billing` `BillingSettingsPage` [`routes/org/settings/**`].
- **Components:** in `routes/org/settings/`: `SettingsNav`/`SettingsPage`, `form-bits.tsx`
  (`TagInput`, `SwitchField`, `MoneyInput`), `autopilot-explainer.tsx` (`TierCards`,
  `RoutingPreviewTable`), `routing-preview.ts` (`routeApplication`, which mirrors the review policy),
  `use-org.ts`, `labels.ts`. Onboarding reuses `form-bits` and `labels`.

### ui knowledge

- **Pages:** `/knowledge/documents` `DocumentsPage`, `/knowledge/documents/$documentId`
  `DocumentDetailPage`, `/knowledge/facts` `FactsPage`, `/knowledge/search` `SearchPage`
  [`routes/org/knowledge/**`]; `/projects` `ProjectsPage`, `/projects/$projectId` `ProjectDetailPage`
  [`routes/org/projects/**`].
- **Components:** `components/knowledge/**`: `UploadForm`, `PasteTextDialog`, `FactCard`, `FactList`,
  `AddFactForm`, `CoveragePanel`, `ProjectForm`, `Highlight`, `KbLink`, the status badges
  (`DocumentStatusBadge`, `FactStatusBadge`, `ProjectStatusBadge`), `labels.ts`, and `queries.ts`
  (`kbKeys`, `useDocuments`, `useFacts`, `useFactActions`, `useProjects`, …).

### ui interview

- **Pages:** `/interviews` `InterviewsPage`, `/interviews/$interviewId` `InterviewSessionPage`
  [`routes/org/interviews/**`].
- **Components:** `TranscriptUploadDialog`, `links.tsx` (`AppLink`, `interviewPaths`), `shared.ts`
  (`interviewKeys`, labels); `components/voice/**`: `DictationButton`, `useRecorder`,
  `transcribeAudio`.

### ui grants

- **Pages:** `/orgs/$orgId` `DashboardPage` [`routes/org/dashboard.tsx`]; `/opportunities`
  `OpportunitiesPage`, `/opportunities/$opportunityId` `OpportunityDetailPage`
  [`routes/org/opportunities/**`].
- **Components:** `components/grants/**`: `dashboard-widgets.tsx` (`KpiTile`, `AttentionList`,
  `DeadlinesTimeline`, `TopMatches`, `CoverageNudge`, `GettingStarted`, `ActivityFeed`),
  `dashboard-model.ts`, `OpportunityCard`, `match-badges.tsx` (`FitMeter`, `EligibilityBadge`,
  `MatchStatusBadge`, `DeadlineLabel`), `DraftApplicationButton`/`DraftApplicationForm`,
  `ImportGrantMenu`, `ApiErrorAlert`/`UpgradePrompt`, `format.ts`, `opportunity-list.ts`, and
  `queries.ts` (`grantKeys`, `useOpportunities`, `useMatches`, `useDraftApplication`, …).

### ui applications (in progress)

- **Pages:** `/applications` `ApplicationsPage`, `/applications/$applicationId`
  `ApplicationDetailPage`, `/reviews` `ReviewsPage`, `/submissions` `SubmissionsPage`
  [`routes/org/applications/**`, `routes/org/reviews/**`, `routes/org/submissions/**`]. All four are
  still `PageHeader description="Coming soon."` stubs.
- **Components** (`components/application/**`, being written): `claims.tsx` (`ClaimView`,
  `ParagraphView`, `CitationButton`), `SectionCard`, `FlagsPanel`, `summary-cards.tsx`
  (`ReviewerSummaryCard`, `GroundingCard`), `review-actions.tsx` (`ReviewActions`, `FeedbackWidget`,
  `OutcomeCard`, `CostLine`), `submissions-panel.tsx` (`SubmissionsPanel`, `PackageDownloads`,
  `IntegrityBadge`, `ManualGuidePanel`), `model.ts`, `edit-model.ts`, `queries.ts`.

### ui sourcing (in progress, not in `router.tsx`)

- **Pages:** `SourcingPage` [`routes/org/sourcing/sourcing.tsx`], which is not routed yet.
- **Components:** `components/sourcing/**`: `WatchlistPanel` (with `AddWatchSourceForm`,
  `WatchSourceRow`, `WatchEventsFeed`), `ProspectsPanel` (with `ProspectRow`, `ProspectsExplainer`),
  `HowWeFindGrants`, `ReasonList`, `format.ts`, and `queries.ts` (`useWatchlist`, `useProspects`, …).
  These call the unmounted watchlist and prospects routers.
