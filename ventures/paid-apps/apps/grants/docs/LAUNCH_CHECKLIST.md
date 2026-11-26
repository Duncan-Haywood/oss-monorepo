# Grant Autopilot: launch checklist (go/no-go)

Target: production Worker `grant-autopilot` at `https://marisstella.app/grants` (the `APP_URL` GitHub
variable; the catalogue Worker forwards `/grants/*` to it, and the old host `grants.marisstella.app`,
the `APP_DOMAIN` variable, 301s there since 2026-11-24, see `docs/DEPLOY.md` "Path prefix"), deployed by
`.github/workflows/grants-deploy.yml`. First tenant: a New Mexico charity.

Reviewed 2026-11-19 against the working tree. Each claim was checked in the code, not the docs. Line
numbers are as of this review, and several files were still being edited by other agents.
Legend: ✅ done · ⚠️ partial · ❌ missing.

## Verdict: **NO-GO**

Resolve the ten blockers below, then re-run this list. Most of them are configuration and paperwork, not
code. Once migrations exist and email works, the code path is close to launch-ready.

### Top 10 blockers

| # | Blocker | Fix |
| - | ------- | --- |
| 1 | No D1 migrations. `migrations/` does not exist (`wrangler.jsonc:41`, `drizzle.config.ts:6`), so the deploy gate fails (`grants-deploy.yml:57-62`). `db/schema/digest.ts` and `db/schema/notifications.ts` are used by `services/digest/*` and `services/notifications/*` but are **not exported** from `db/schema/index.ts`, so `drizzle-kit generate` would leave those tables out. | Export both from `schema/index.ts`, finish the schema integration pass (including the PERFORMANCE.md indexes), run `pnpm db:generate`, review the SQL, then commit `migrations/`. |
| 2 | `EMAIL_FROM` is `no-reply@example.org` (`wrangler.jsonc:97`), and the deploy does not override it (`grants-deploy.yml:143-150`). Resend rejects unverified senders. Production requires email verification (`services/auth/auth.ts:55`), so **nobody could finish signing up**. | Since then the deploy sets `EMAIL_FROM` (default `no-reply@marisstella.app`). Onboard that domain to Cloudflare Email Service with `grants-email-sending.yml` (SPF, DKIM, DMARC set up by Cloudflare) and set `EMAIL_PROVIDER=cloudflare` (docs/EMAIL.md), or verify it in Resend. |
| 3 | (2026-11-24: with the `EMAIL` binding, production now sends through Cloudflare Email Service when no Resend key is set; `LogEmailSender` remains only when neither exists.) Without `RESEND_API_KEY`, production silently uses `LogEmailSender` (`context.ts:150-152`), which drops verification, reset and invitation emails. Without `ANTHROPIC_API_KEY`, every AI route returns 503 (`context.ts:36-52`). The deploy treats both as optional (`grants-deploy.yml:171-174`). | Make the production deploy fail when either secret is neither in GitHub nor already on the Worker. |
| 4 | The test-only identity header `x-test-user-id` is honored whenever `APP_ENV === "test"` (`middleware/session.ts:30`), and nothing at runtime stops a deployment from running with that value. | Apply the `assertRuntimeEnv` diff to `context.ts` (below). The deploy already pins `APP_ENV:production` (`grants-deploy.yml:144`). |
| 5 | All five legal documents are marked "Draft … have counsel review it before launch" and still say "[contact email to be confirmed before launch]" (for example `docs/legal/privacy.md:5,83` and `terms.md:5,80`). Paddle's domain review requires final terms, privacy and refund pages. | Get counsel review, fill in the contact email, run `node docs/legal/sync-documents.mjs`, and bump `POLICY_VERSION` (`src/shared/legal.ts:4`). |
| 6 | The placeholder origin `grantautopilot.example` is still used for `CONTACT_EMAIL` in `components/marketing/site-map.ts:46`, and the static `public/robots.txt` / `public/sitemap.xml` (the build overwrites both). | Replace it with a real support inbox. Canonical URLs now use `SITE_URL` (`https://marisstella.app/grants`) in `components/marketing/meta.ts`; `index.html`, `robots.txt` and `sitemap.xml` get it from `scripts/prerender.mjs` at build time. |
| 7 | Billing is not live. With no `BILLING_PROVIDER`, `BILLING_API_KEY` and `BILLING_WEBHOOK_SECRET`, the provider is `null` and the billing endpoints return 503 (`ports/billing-providers.ts:26-39`). | Either complete the Paddle setup (`docs/PRICING.md` "Paddle setup") or explicitly launch the first tenant on a comp plan and hide checkout. |
| 8 | Alerting is incomplete. `grants-monitor.yml` probes `/api/health` and `/api/health/deep` every 30 minutes and opens an `incident` issue, but the deep check covers only D1, discovery, stuck jobs, LLM error rate and spend (`routes/health.ts:170-283`). Nothing alerts on the API 5xx rate or the DLQ. There is no Anthropic console spend limit, and the probe can't run until `APP_DOMAIN` and `INTERNAL_API_TOKEN` are set in GitHub (it probes `APP_URL`, default `https://marisstella.app/grants`). | Set the Anthropic workspace spend limit, add a Workers Observability alert on the 5xx rate and a DLQ backlog alert, and make sure incident issues notify a person. |
| 9 | The working tree fails `pnpm typecheck` (billing `orgId` on `BillingWebhookEvent`/`CheckoutRequest`, `components/application/test-fixtures.ts`). The deploy runs typecheck first (`grants-deploy.yml:67`). | Finish the in-flight billing and application UI changes so CI is green. |
| 10 | The post-deploy smoke test checks only `ok` and `fake` (`grants-deploy.yml:237`). A deploy that came up as `development` or `test` would still pass. | Extend the `jq` check to `.env == "production"` (`/api/health` returns `env`, `routes/health.ts:333`). |

---

## Security

| Status | Item | Evidence / remediation |
| ------ | ---- | ---------------------- |
| ✅ | Asset CSP is minimal and matches the build | `public/_headers:21`. Checked against `pnpm build` output: no inline script or style in `dist/client/index.html`, no `url()` or `@font-face` in the CSS, and no runtime `<style>` injection in the bundle. `style-src 'unsafe-inline'`, `data:` and `blob:` were removed. `object-src 'none'`, `worker-src 'none'` and `upgrade-insecure-requests` were added. A `report-to`/`report-uri` stub is at `_headers:16-19`. |
| ✅ | API headers aligned with asset headers | `middleware/security.ts:16-40`. The shared set is nosniff, XFO DENY, Referrer-Policy, Permissions-Policy, COOP and CORP. API responses get a deny-all CSP (`API_CSP`, `security.ts:9`), and a route's own CSP is kept (the sandboxed document download, `routes/org/documents.ts:176-192`). `security.test.ts` fails if the two sets drift. |
| ✅ | HSTS | Assets: `_headers:22`. API: production or https (`security.ts:37-39`). Remediation: add `preload` only after the whole `marisstella.app` zone is https-only. |
| ⚠️ | CSP violation reporting | Stub only (`_headers:16-19`). Remediation: point `report-to` at a collector, starting with `Content-Security-Policy-Report-Only`. |
| ✅ | CORS is off for `/api` (same-origin only) | No `cors()` or `Access-Control-*` anywhere in `src/worker`. Better Auth is mounted bare (`routes/auth.ts:11-13`). Covered by `security.test.ts` ("never enables CORS"). |
| ✅ | CSRF | `originCheck` (`security.ts:46-56`, mounted at `app.ts:56`), `trustedOrigins: [origin of APP_URL]` (`authUrls` in `auth.ts`) and JSON-only writes (`middleware/request-limits.ts`). |
| ✅ | Session cookies: Secure, HttpOnly, SameSite=Lax in production | `auth.ts:166-167`: `useSecureCookies: prod` (`__Secure-` prefix) and `defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: prod }`, where `prod = isHardened(env)` is `APP_ENV === "production"` or an https `APP_URL` (`auth.ts:40-41`). Cookies are host-only (no `domain`) and scoped to the base path (`Path=/grants` in production, `authUrls` in `auth.ts`). |
| ✅ | `AUTH_SECRET` is required when hardened | `auth.ts:176`. The deploy generates it if missing (`grants-deploy.yml:207-227`). |
| ❌ | `APP_ENV=test` cannot reach production | Nothing at runtime refuses it (`session.ts:30`, `env.ts:32`, `rate-limit.ts:146`, `queues/enqueue.ts:14`). Remediation: apply the `context.ts` diff below. |
| ⚠️ | `FAKE_EXTERNALS` | Production pins `false` (`grants-deploy.yml:149`). The demo worker runs `APP_ENV=production` with `FAKE_EXTERNALS=true` and gets no `BILLING_WEBHOOK_SECRET` (`grants-deploy.yml:191-192`), so its fake billing provider verifies against the public `FAKE_WEBHOOK_SECRET` (`billing-providers.ts:27-28`). Remediation: generate a random webhook secret for the demo, or refuse fake billing when `APP_ENV=production`. |
| ✅ | Tenant isolation | `requireOrg` (`middleware/tenant.ts:11-29`) is mounted at `app.ts`. Cross-tenant tests are in `test/worker/*`. |
| ✅ | Uploaded files never render on our origin | `routes/org/documents.ts:176-192` sends attachment, nosniff and `sandbox` CSP, with magic-byte checks in `services/ingestion/files.ts`. |
| ✅ | Internal API | Off unless `INTERNAL_API_TOKEN` is set (`routes/internal.ts:28`), compared in constant time (`internal.ts:12-23`). |
| ✅ | Rate limits | `wrangler.jsonc:77-81` plus Better Auth limits (`auth.ts:150-164`, in-memory and per-isolate). |
| ⚠️ | Second origins | When `APP_DOMAIN` is set, `workers_dev` is turned off (`scripts/provision.mjs:251-253`). Version preview URLs are now off (`wrangler.jsonc:31`). Remediation: confirm in the dashboard after the first deploy. |
| ⚠️ | Public client source maps | `vite.config.ts:10` (`sourcemap: true`) publishes `dist/client/assets/*.map`. Remediation: use `sourcemap: "hidden"` for the client environment, or add `*.map` to `public/.assetsignore`. |
| ⚠️ | Google OAuth | Optional (`auth.ts:76-79`, `:133`). Remediation: register `https://marisstella.app/grants/api/auth/callback/google` in Google Cloud and set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, or remove the button. |

### Secrets the app reads (`src/worker/env.ts:3-28`) and whether the deploy sets them

| Secret | Read at | Set by `grants-deploy.yml` | Launch need |
| ------ | ------- | -------------------------- | ----------- |
| `AUTH_SECRET` | `auth.ts:84,176`, `privacy/consents.ts:29` (IP-hash salt) | ✅ from GitHub, or generated once (`:181`, `:207-227`) | Required. Rotating it logs everyone out and changes IP hashes. |
| `INTERNAL_API_TOKEN` | `routes/internal.ts:26` | ✅ from GitHub or generated (`:182`, `:207-227`) | Optional |
| `ANTHROPIC_API_KEY` | `context.ts:119-122` | ✅ if present in GitHub (`:171`) | **Required**: make it mandatory (blocker 3) |
| `RESEND_API_KEY` | `context.ts:150-151` | ✅ if present (`:174`) | **Required**: make it mandatory (blocker 3) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `auth.ts:76-78` | ✅ if present (`:172-173`) | Optional |
| `BILLING_PROVIDER`, `BILLING_API_KEY`, `BILLING_WEBHOOK_SECRET`, `BILLING_PRICE_IDS` | `billing-providers.ts:30-36` | ✅ if present (`:175-178`), never on demo | Required for paid plans (blocker 7) |
| `SIMPLER_GRANTS_API_KEY` | `services/discovery/*`, `scheduled.ts:25-26` | ✅ if present (`:179`) | Optional; without it only the Grants.gov source runs |
| `PLATFORM_ADMIN_EMAILS` | `services/watchlist/index.ts:49-51` | ✅ if present (`:180`) | Set it to the operator email |
| `ORG_MONTHLY_LLM_CAP_USD`, `GLOBAL_DAILY_LLM_CAP_USD` | `services/guards/llm-budget.ts:85` | ❌ manual by design (kill switch, `OPERATIONS.md`) | Defaults $25/org/month and $200/day (`llm-budget.ts:18-19`) |
| `INLINE_JOBS`, `DEMO_MODE` | `queues/enqueue.ts:14`, `services/demo/index.ts:34` | demo only, as `--var` (`:147`) | Must stay unset in production |
| `TEST_SCHEMA_SQL` | `test/worker/setup.ts:6` | never | Must never exist in a deployment (the `context.ts` guard relies on this) |

Vars the deploy overrides: `APP_ENV`, `APP_URL`, `FAKE_EXTERNALS` (`grants-deploy.yml:144-150`). It does
not override `EMAIL_FROM` (blocker 2) or `CRAWLER_USER_AGENT` (still `+https://github.com/`,
`wrangler.jsonc:98`; point it at a page that describes the bot and gives a contact).

## Privacy / legal

| Status | Item | Evidence / remediation |
| ------ | ---- | ---------------------- |
| ❌ | Legal documents final | Drafts with a placeholder contact (blocker 5). |
| ✅ | Export, delete and retention exist | `routes/org/privacy.ts`, `services/privacy/{export,deletion,retention}.ts`, and the daily sweep is enqueued at `scheduled.ts:28`. |
| ⚠️ | Deletion and export scale | Export buffers every row and every R2 object before `zipSync`, and the org-delete cascades hit unindexed FKs (`PERFORMANCE.md` findings 2 and 8). Remediation: land the tier-1/3 indexes in the first migration, and test both on a large synthetic org. |
| ⚠️ | Privacy policy matches backups | `privacy.md` says backups "roll off on their normal schedules". In practice, D1 Time Travel keeps 30 days and R2 has no backups. Remediation: state "within 30 days". |
| ✅ | IPs hashed or truncated | Sessions: `auth.ts:138-143`. Consents: `privacy/consents.ts:27-29`. |
| ⚠️ | Subprocessor list | `privacy.md` says "Email delivery provider" and "Merchant-of-record payment processor". Remediation: name Resend and Paddle once contracts are signed, and get DPAs with Cloudflare, Anthropic, Resend and Paddle. |

## Reliability

| Status | Item | Evidence / remediation |
| ------ | ---- | ---------------------- |
| ✅ | Queue retries and DLQ | `wrangler.jsonc:57-68` (3 retries, `grant-autopilot-jobs-dlq`). Non-retryable errors are acked (`queues/consumer.ts`). |
| ❌ | DLQ monitoring | Nothing consumes or alerts on the DLQ. Messages expire after the queue's retention period. Remediation: alert on DLQ backlog, or add a small consumer that logs `job.dead_lettered`. |
| ✅ | Durable pipeline | Workflow binding at `wrangler.jsonc:69-75`. See `docs/WORKFLOWS.md` for inspect, restart and terminate. |
| ✅ | Crons are cheap and only enqueue | `scheduled.ts:13-28`. Demo crons are off (`provision.mjs:247`). |
| ⚠️ | D1 hot paths | `PERFORMANCE.md` findings 1-4. `llm_calls` indexes are now in the schema (`db/schema/ops.ts:30,32`), and the flag insert is batched (`services/pipeline/steps.ts:429-431`). Remediation: ship every tier-1 index in the first migration. |
| ✅ | CPU limit / placement decision | Platform defaults, with the reasoning at `wrangler.jsonc:19-27`. Revisit using Workers Metrics. |
| ⚠️ | Rollback | The deploy summary prints `wrangler rollback <version-id>` (`grants-deploy.yml:257`), but code rollback does not undo migrations. Remediation: keep migrations additive (expand, then contract), and record a Time Travel bookmark before applying them (see Data). |
| ✅ | Health checks and uptime probe | `/api/health` (one D1 query, `routes/health.ts:331-334`), plus `/api/health/deep` behind the bearer token. Both are probed by `.github/workflows/grants-monitor.yml` (every 30 min, opens and closes an `incident` issue). See `docs/MONITORING.md`. |

## Data

### Backup posture

| Status | Store | Posture / remediation |
| ------ | ----- | --------------------- |
| ✅ | D1 Time Travel | Always on. Workers Paid (required for Queues and Workflows) keeps 30 days of point-in-time restore. Restore with `wrangler d1 time-travel restore grant-autopilot --timestamp=<RFC3339>` (or `--bookmark=`). This restores the **whole shared database**, every tenant at once. |
| ⚠️ | Pre-migration bookmark | Not captured. Remediation: in `grants-deploy.yml`, before `d1 migrations apply`, run `wrangler d1 time-travel info grant-autopilot --json` and write the bookmark to the step summary. |
| ❌ | Off-platform D1 copy | None. Remediation: run `wrangler d1 export --remote` weekly to a separate R2 bucket or account. If FTS5 virtual tables are adopted, re-check whether `export` handles them (`PERFORMANCE.md` finding 5). |
| ❌ | R2 `grant-autopilot-files` | No versioning (R2 has none) and no copy. Originals, voice audio, **submission packages** (the immutable record) and exports are unrecoverable after a bad delete. Remediation: replicate the bucket on a schedule (for example with Super Slurper) to a second bucket with restricted credentials. The copy must honor org deletion, so purge `orgs/{orgId}/` there too. |
| ⚠️ | Vectorize | No backup. It can be rebuilt from `document_chunks` in D1 by re-embedding. Remediation: write and test a re-embed script before it is needed. |
| ❌ | Restore drill | Never run. Remediation: restore to a scratch database once before launch, and time it. |

### Migrations status

| Status | Item | Evidence / remediation |
| ------ | ---- | ---------------------- |
| ❌ | `apps/grants/migrations/` | **Does not exist.** It is configured at `wrangler.jsonc:41` (`migrations_dir`) and `drizzle.config.ts:6` (`out`). Tests and e2e build the schema with `drizzle-kit export` (`vitest.worker.config.ts:30`, `scripts/e2e-server.sh`), so nothing exercises migrations. |
| ❌ | Schema completeness | `db/schema/digest.ts` and `db/schema/notifications.ts` are missing from `db/schema/index.ts` (blocker 1). |
| ✅ | Deploy ordering | Migrations are applied before the code goes live, or right after the first deploy that creates the database (`grants-deploy.yml:124-162`). The job fails if `migrations/*.sql` is missing (`:57-62`). |
| ⚠️ | Migration test | Remediation: add a CI step that applies `migrations/` to an empty local D1 and diffs the result against `drizzle-kit export`. |

## Cost

| Status | Item | Evidence / remediation |
| ------ | ---- | ---------------------- |
| ✅ | Per-org and global LLM caps, kill switch | `services/guards/llm-budget.ts:18-19,85`, wrapped in `context.ts:120-127`. See the `OPERATIONS.md` kill switch. |
| ❌ | Anthropic console spend limit | Manual. Set it slightly above the global cap × 30 (blocker 8). |
| ✅ | Abuse rate limits | `wrangler.jsonc:77-81`. |
| ⚠️ | D1 rows read | The global budget sum was a full scan. The index is now in the schema (`ops.ts:30`) but ships only with migrations. |
| ⚠️ | Caps per plan | The caps are not tied to plans yet (`OPERATIONS.md` "Known limits"). This is fine for one tenant. |

## Billing

| Status | Item | Evidence / remediation |
| ------ | ---- | ---------------------- |
| ❌ | Paddle live | No provider configured (blocker 7). |
| ✅ | Webhook signature verified and idempotent | `routes/billing-webhook.ts:20-23`, `services/billing/webhooks.ts`. Mounted before the Origin and session checks (`app.ts`). |
| ⚠️ | Billing types in flux | Typecheck errors in `ports/billing/*` and `services/billing/webhooks.ts` (blocker 9). |
| ⚠️ | Webhook URL | Remediation: register `https://marisstella.app/grants/api/billing/webhook` in Paddle (the old `grants.marisstella.app` URL keeps answering, it is not redirected) and test a sandbox event end to end. |

## Email

| Status | Item | Evidence / remediation |
| ------ | ---- | ---------------------- |
| ❌ | Sender | `EMAIL_FROM` is a placeholder (blocker 2). |
| ❌ | Provider key required | Without it, email is silently dropped (blocker 3). |
| ❌ | Domain authentication | Remediation: SPF, DKIM and DMARC for the sending domain, then a test on Gmail and Outlook. |
| ✅ | No tokens in logs | `LogEmailSender` logs only the recipient count and the subject (`ports/resend-email.ts:90-102`). |
| ⚠️ | Bounces and complaints | Remediation: watch them in the Resend dashboard. No webhook is handled. |
| ⚠️ | Newsletter (guide emails) | Signup + double opt-in work; the welcome series is off (`MARKETING_EMAIL_ENABLED: "false"`) and cannot send until `MARKETING_POSTAL_ADDRESS` (CAN-SPAM) is set. Steps: docs/EMAIL_MARKETING.md, "Turning it on". |
| ✅ | Unsubscribe on notification mail | Weekly digest and deadline nudges go per recipient with `List-Unsubscribe` + one-click (`services/digest/send.ts`). |

## Observability

| Status | Item | Evidence / remediation |
| ------ | ---- | ---------------------- |
| ✅ | Workers Logs on, 100% sampled | `wrangler.jsonc:18` (`head_sampling_rate: 1`). |
| ✅ | Structured access log with `x-request-id` | `middleware/observability.ts:1,16`, mounted at `app.ts:45`. |
| ✅ | Worker source maps uploaded | `wrangler.jsonc:32`. |
| ⚠️ | Alerts | Health-probe incidents only (`grants-monitor.yml`). No 5xx-rate, DLQ or Anthropic spend-limit alerts (blocker 8). |
| ⚠️ | Logpush and long-term retention | Not configured. Workers Logs keeps only a few days. A note is at `wrangler.jsonc:16-17`. |
| ⚠️ | Client error reporting | None. Remediation: at minimum, surface `x-request-id` in error toasts. |

## UX

| Status | Item | Evidence / remediation |
| ------ | ---- | ---------------------- |
| ✅ | 404 page | `src/client/router.tsx:143` (`defaultNotFoundComponent`). |
| ⚠️ | Error boundary | There is no `defaultErrorComponent` in `router.tsx`, so TanStack's generic one shows. Remediation: add a friendly error page that shows the request id. |
| ⚠️ | Bundle size | One 875 kB JS chunk (256 kB gzip) from `pnpm build`. Remediation: lazy-load the org routes. Not a blocker for one tenant. |
| ⚠️ | Main flows on real externals | E2E runs on fakes only (`scripts/e2e-server.sh`). Remediation: do a manual walkthrough on production with the first tenant's real documents before inviting them. |

## Support

| Status | Item | Evidence / remediation |
| ------ | ---- | ---------------------- |
| ❌ | Support contact | Placeholders in the legal docs and `site-map.ts:46` (blockers 5 and 6). |
| ⚠️ | Runbook | `docs/OPERATIONS.md` and `docs/WORKFLOWS.md` exist. Remediation: add an incident checklist covering the kill switch, rollback, Time Travel restore and the customer notice the privacy policy promises. |
| ⚠️ | Platform admin | Remediation: set `PLATFORM_ADMIN_EMAILS` to the operator. |

## SEO

| Status | Item | Evidence / remediation |
| ------ | ---- | ---------------------- |
| ✅ | `index.html` meta | Title, description, `og:url`, and `og:image`/`twitter:image` on `https://marisstella.app/grants` (placeholder in `index.html`, replaced with `SITE_URL` by `scripts/prerender.mjs`). |
| ✅ | Canonical and `og:url` set by the SPA | `SITE_URL` = `https://marisstella.app/grants` in `components/marketing/meta.ts`. |
| ❌ | `robots.txt` / `sitemap.xml` | Placeholder origin (`public/robots.txt:8`, `public/sitemap.xml`). App and API paths are already disallowed (`robots.txt:5-6`). |
| ⚠️ | SPA-only rendering | Marketing pages render client-side, which crawlers other than Google may not run. Acceptable for launch. |

---

## Changes made in this review

- `public/_headers`: tightened the CSP to what the build needs (no `'unsafe-inline'`, `data:` or `blob:`).
  Added `object-src`/`frame-src`/`worker-src 'none'`, `upgrade-insecure-requests`, a CSP reporting stub,
  HSTS, COOP, CORP and a wider Permissions-Policy, plus immutable caching for `/assets/*`.
- `src/worker/middleware/security.ts`: the API now sends the same shared headers, a deny-all CSP (route
  CSPs are kept) and HSTS on https. No CORS. New test: `security.test.ts` (header parity with
  `_headers`, CSP rules, CORS off, Origin check).
- `index.html`: social image URLs and `og:url` now use the production origin.
- `wrangler.jsonc`: `observability.head_sampling_rate: 1`, `preview_urls: false`, and comments
  recording the placement, CPU-limit, Logpush and vars-override decisions. Full-line comments only.

### Proposed diff for the shared file `src/worker/context.ts` (not applied)

```diff
--- a/apps/grants/src/worker/context.ts
+++ b/apps/grants/src/worker/context.ts
@@ -80,7 +80,20 @@
   executionCtx?: Pick<ExecutionContext, "waitUntil">;
 }
 
+/**
+ * Refuses to run a real deployment in test mode. APP_ENV=test turns on the x-test-user-id identity
+ * header (middleware/session.ts), fake externals and inline jobs, so it may only come from
+ * vitest.worker.config.ts, which also injects TEST_SCHEMA_SQL. No deployment has that binding.
+ */
+export function assertRuntimeEnv(env: Pick<Env, "APP_ENV" | "TEST_SCHEMA_SQL">): void {
+  if (env.APP_ENV === "test" && !env.TEST_SCHEMA_SQL) {
+    throw new Error("APP_ENV=test outside the test runner: refusing to start");
+  }
+}
+
 export function createAppContext(env: Env, overrides: ContextOverrides = {}): AppContext {
+  // Every entry point (fetch, queue, cron, Workflow) builds its context here.
+  assertRuntimeEnv(env);
   const db = overrides.db ?? createDb(env.DB);
   const logger = overrides.logger ?? createLogger({ app: "grant-autopilot", env: env.APP_ENV });
   const fake = isFake(env);
```

Every fetch, queue, cron and Workflow invocation goes through `createAppContext`. On the fetch path the
throw becomes a 500, and `/api/health` fails too, so the deploy smoke test catches it. All worker tests
pass the real vitest `env`, which carries `TEST_SCHEMA_SQL`, and no unit test calls `createAppContext`.
The patch applies cleanly (`patch --dry-run`). Suggested unit test:
`expect(() => assertRuntimeEnv({ APP_ENV: "test" })).toThrow()` and
`expect(() => assertRuntimeEnv({ APP_ENV: "test", TEST_SCHEMA_SQL: "x" })).not.toThrow()`.

### Proposed one-line change for `grants-deploy.yml` (owned by the infra agent)

```diff
-            jq -e --argjson fake "$expect_fake" '.ok == true and .fake == $fake' <<<"$body" >/dev/null; do
+            jq -e --argjson fake "$expect_fake" '.ok == true and .env == "production" and .fake == $fake' <<<"$body" >/dev/null; do
```
