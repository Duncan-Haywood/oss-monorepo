# Deploying Grant Autopilot

Everything is infrastructure as code: `wrangler.jsonc` (bindings, crons, vars), `scripts/provision.mjs`
(resources `wrangler deploy` does not create), `migrations/` (D1 schema) and two GitHub Actions workflows.
Nothing is clicked together in the dashboard except the one-time account/token/GitHub setup below.

## Architecture

```
                    ┌─────────────── Cloudflare account (Workers Paid) ────────────────┐
 browser ──HTTPS──▶ │  Worker "grant-autopilot"                                         │
                    │   ├─ static SPA assets (dist/client)                              │
                    │   ├─ Hono API /api/*  ──▶ D1 "grant-autopilot" (Drizzle)         │
                    │   │                   ──▶ R2 "grant-autopilot-files" (orgs/{id}/) │
                    │   │                   ──▶ Vectorize "grant-autopilot-chunks"      │
                    │   │                   ──▶ Workers AI (bge-m3, toMarkdown, Whisper)│
                    │   │                   ──▶ Rate limiting (AUTH/LLM/UPLOAD)         │
                    │   ├─ queue consumer  ◀── Queue "grant-autopilot-jobs" (+ "-dlq")  │
                    │   ├─ Workflow "grant-autopilot-application-pipeline"              │
                    │   └─ crons (13:17 UTC discovery, */30 follow-ups)                 │
                    └───────────────────────────────┬───────────────────────────────────┘
                                                    └──▶ Anthropic API (Claude), email (Cloudflare Email Service / Resend), grants APIs
```

In production the browser reaches the Worker through the catalogue Worker on `marisstella.app`, which
forwards `/grants/*` over a service binding; the Worker's own host `grants.marisstella.app` only
redirects there (see "Path prefix").

The demo deployment is a second, fully separate Worker (`grant-autopilot-demo`) with its own D1, R2,
Vectorize index, queues, Workflow and rate-limit namespaces, running on deterministic fakes
(`FAKE_EXTERNALS=true`, `INLINE_JOBS=true`, `DEMO_MODE=true`): no Anthropic key, no outbound calls.

### Pipeline

```
 feature branch ──push──▶ grants-ci (biome, typecheck, unit, worker tests, build, evals --fake,
        │                            migrations check, e2e [allowed to fail])
        └──PR──▶ grants-ci on the PR ──review + green checks──▶ merge to main
                                                                   │
 main ──push──▶ grants-deploy (environment: production, approval if configured)
                  install ─▶ checks ─▶ build ─▶ provision.mjs ─▶ D1 migrations ─▶ wrangler deploy
                  ─▶ secret bulk (GitHub secrets) ─▶ generate missing AUTH_SECRET/INTERNAL_API_TOKEN
                  ─▶ smoke test GET /api/health (ok:true, fake:false)
 Actions ▸ grants-deploy ▸ Run workflow ▸ environment=demo  ─▶ same steps for grant-autopilot-demo
```

On the very first deploy the D1 database does not exist yet, so the order is
`provision ─▶ deploy (auto-provisions D1/R2) ─▶ migrations`. After that it is always
`migrations ─▶ deploy`, so migrations must be backward compatible with the previous Worker version.

## One-time setup (owner)

### 1. Cloudflare plan

**Workers Paid** is required: Queues, Workflows, Vectorize at this scale, the 5-minute CPU limit used by
document processing, and the Workers Rate Limiting API are not (fully) available on the free plan.

### 2. API token

Create a custom token (My Profile ▸ API Tokens ▸ Create Custom Token):

| Scope   | Permission                    | Why                                         |
| ------- | ----------------------------- | ------------------------------------------- |
| Account | Workers Scripts — Edit        | deploy, versions, secrets, rollback         |
| Account | D1 — Edit                     | auto-provision DB, migrations               |
| Account | Workers R2 Storage — Edit     | auto-provision bucket                       |
| Account | Queues — Edit                 | jobs queue + DLQ, consumer binding          |
| Account | Vectorize — Edit              | index + metadata indexes                    |
| Account | Workers AI — Read             | AI binding                                  |
| Account | Account Settings — Read       | account / workers.dev subdomain lookup      |
| Zone    | Workers Routes — Edit         | custom domain (only with `APP_DOMAIN`)      |
| Zone    | DNS — Edit                    | custom domain DNS record (only with domain) |

Limit the account resources to your account and the zone resources to the zone of `APP_DOMAIN`
(e.g. `marisstella.app`). The zone must be on the same Cloudflare account.

### 3. GitHub

Repository ▸ Settings ▸ Secrets and variables ▸ Actions:

| Name                                        | Kind     | Required | Notes                                                              |
| ------------------------------------------- | -------- | -------- | ------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`                      | secret   | yes      | token above                                                        |
| `CLOUDFLARE_ACCOUNT_ID`                     | secret   | yes      | dashboard ▸ Workers & Pages ▸ Account ID                          |
| `ANTHROPIC_API_KEY`                         | secret   | prod     | without it drafting returns 503 `llm_not_configured`               |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | secret   | no       | Google sign-in; redirect `https://marisstella.app/grants/api/auth/callback/google` (`$APP_URL/api/auth/callback/google`) |
| `RESEND_API_KEY`                            | secret   | no       | Resend: marketing mail, and transactional mail while `EMAIL_PROVIDER` is `auto`/`resend` (docs/EMAIL.md) |
| `EMAIL_PROVIDER`                            | variable | no       | `auto` (default), `cloudflare` or `resend`: transactional email provider; `ses` / `ses-with-fallback`: Amazon SES for all mail (docs/EMAIL.md) |
| `LLM_PROVIDER`                              | variable | no       | `anthropic` (default), `aws` or `aws-with-fallback`: Claude Platform on AWS, see "Moving LLM and email to AWS" below |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | secret | no       | scoped IAM user for Claude Platform on AWS and SES (below); `AWS_SESSION_TOKEN` only with temporary credentials |
| `AWS_REGION`                                | variable | no       | region of Claude Platform on AWS, and of SES unless `SES_REGION` is set |
| `ANTHROPIC_AWS_WORKSPACE_ID`                | variable | no       | Claude workspace on AWS, sent as the `anthropic-workspace-id` header |
| `SES_REGION`, `SES_CONFIGURATION_SET`       | variable | no       | SES in another region; configuration set for bounce/complaint events |
| `CLOUDFLARE_EMAIL_SENDING_TOKEN`            | secret   | no       | token with Email Sending Write, for `grants-email-sending.yml` |
| `BILLING_PROVIDER`, `BILLING_API_KEY`, `BILLING_WEBHOOK_SECRET`, `BILLING_PRICE_IDS` | secret | no | see `docs/PRICING.md` |
| `SIMPLER_GRANTS_API_KEY`                    | secret   | no       | grants.gov discovery                                               |
| `PLATFORM_ADMIN_EMAILS`                     | secret   | no       | comma-separated                                                    |
| `AUTH_SECRET`, `INTERNAL_API_TOKEN`         | secret   | no       | generated on first deploy when absent (see below)                  |
| `APP_URL`                                   | variable | no       | public URL, default `https://marisstella.app/grants` (see "Path prefix") |
| `BASE_PATH`                                 | variable | no       | production path prefix, default `/grants`; must equal `APP_URL`'s path |
| `APP_DOMAIN`                                | variable | no       | old host `grants.marisstella.app` (default): attached only to 301 to `APP_URL` |
| `DEMO_DOMAIN`                               | variable | no       | demo host; default `grants-demo.$APP_DOMAIN`                       |

Only non-empty secrets are uploaded; an unset secret never deletes an existing Worker secret. The demo
deployment never receives `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `SIMPLER_GRANTS_API_KEY` or `BILLING_*`.

**Not uploaded by the deploy workflow yet:** the AWS rows above (`LLM_PROVIDER`, `AWS_*`, `SES_*`,
`ANTHROPIC_AWS_WORKSPACE_ID`). `grants-deploy.yml` is a control-plane file (CODEOWNERS), so passing them
through is its own small PR (and `docs/security/secrets-inventory.yaml` gains the two AWS secrets then).
Until it lands, set them on the Worker by hand: `wrangler secret put AWS_ACCESS_KEY_ID --name <worker>`
(likewise the others); they survive deploys, which only add non-empty values.

#### Moving LLM and email to AWS (owner, 2026-11-24)

One provider for our own traffic, switched without downtime: both paths are wired, the switch is an env
value, the `*-with-fallback` values fail over to the old provider automatically, and the default
(`anthropic`, `auto`) changes nothing. Code: `src/worker/ports/provider-switch.ts`.

1. AWS: subscribe to Claude Platform on AWS (AWS Marketplace) and note the workspace id; verify the
   sending domain in SES (DKIM records as code, like `email-sending.json`) and request production
   access (out of the sandbox); optionally create a configuration set with an SNS/EventBridge
   destination for bounces and complaints.
2. IAM: a dedicated user (transitional; role credentials once the app runs on AWS) allowed only
   `ses:SendEmail` on the sending identity (and configuration set) and the Claude Platform on AWS
   invoke actions on the workspace (see AWS's IAM actions reference for that service). Its keys are
   the two secrets above.
3. Set `AWS_REGION`, `ANTHROPIC_AWS_WORKSPACE_ID`, `LLM_PROVIDER=aws-with-fallback` and
   `EMAIL_PROVIDER=ses-with-fallback`; deploy. Watch the logs for `llm.provider_fallback`,
   `email.provider_fallback`, `llm.aws_not_configured` and `email.ses_not_configured`.
4. After a quiet week: `LLM_PROVIDER=aws`, `EMAIL_PROVIDER=ses`, then retire `ANTHROPIC_API_KEY` and
   `RESEND_API_KEY` (evals still use a first-party key; docs/EVALS.md) and add AWS to the
   subprocessor list (`packages/trust-page/src/subprocessors.ts`).

A half-set switch is safe: `aws`/`ses` without complete AWS settings keeps the old provider and logs a
warning. Spend caps and `llm_calls` recording apply to whichever provider served a call; costs stay
estimated at first-party prices (AWS Marketplace billing; `ports/llm-pricing.ts`).

Settings ▸ Environments: create **`production`** (add required reviewers to gate deploys, and restrict
deployment branches to `main`) and **`demo`**. Environment-level secrets override repository secrets,
e.g. a separate `GOOGLE_CLIENT_ID` for the demo host.

Settings ▸ Branches: protect `main` (require PRs and the `grants-ci` checks `check` and `migrations`).

### 4. Migrations

`apps/grants/migrations/` is the source of truth for the remote D1 schema. Create the initial migration
once and commit it (the deploy refuses to run without it):

```sh
cd apps/grants
pnpm db:generate          # drizzle-kit generate -> migrations/0000_*.sql + meta/
git add migrations && git commit -m "grants: initial D1 migration"
```

After every schema change run `pnpm db:generate` and commit the new file. CI fails when the schema and
migrations drift (`drizzle-kit check` + a guard that `drizzle-kit generate` produces no new file).

## First deploy

1. Complete the setup above (plan, token, secrets, `production` environment, initial migration).
2. Optional: set `APP_DOMAIN` (zone on the same account). Cloudflare creates the DNS record and
   certificate for the custom domain on deploy; the workers.dev URL is turned off when a domain is set.
   Users reach production at `APP_URL` through the catalogue Worker (see "Path prefix"); `APP_DOMAIN`
   only redirects there.
3. Merge to `main` (or Actions ▸ grants-deploy ▸ Run workflow ▸ `production`). The run:
   - `node scripts/provision.mjs` creates the Vectorize index `grant-autopilot-chunks` (1024 dims,
     cosine) with string metadata indexes `documentId` and `kind` (they must exist before vectors are
     inserted), and the queues `grant-autopilot-jobs` / `grant-autopilot-jobs-dlq`. All idempotent.
   - sees that D1 is missing, deploys (wrangler auto-provisions D1 and R2), then applies migrations;
   - uploads the GitHub secrets, generates `AUTH_SECRET` and `INTERNAL_API_TOKEN`, smoke-tests.
4. Sign up on the site. To give the pilot partner the comp plan, use `scripts/bootstrap-org.mjs`.
5. Demo: Actions ▸ grants-deploy ▸ Run workflow ▸ `demo`.

A brand-new custom domain can take a few minutes for its certificate; if the smoke test times out on
the very first run, re-run the job (every step is idempotent).

## Path prefix (https://marisstella.app/grants)

Since 2026-11-24 (owner: "move to the path and do redirect") production is served under `/grants/` on
`https://marisstella.app`. `marisstella.app` is a Custom Domain of the catalogue Worker (another
repository); its router forwards every request whose path is `/grants` or starts with `/grants/` to
the `grant-autopilot` Worker over a service binding, **with the URL unchanged** (host `marisstella.app`,
path still starting `/grants`). This repository only does the Worker side:

- **One setting, `BASE_PATH`** (`src/shared/base-path.ts`). `grants-deploy.yml` builds production with
  `BASE_PATH=/grants` (repository variable `BASE_PATH` overrides) and the demo with none. From it:
  - Vite `base` `/grants/` (bundles, favicon, `import.meta.env.BASE_URL`), the router's `basepath`,
    `apiUrl()` / `appPath()` (`src/client/lib/base-path.ts`) for every API call, download link and
    plain `<a href>`, and the Better Auth client URL;
  - the built `dist/grant_autopilot/wrangler.json` (`vite.config.ts`): `assets.base_path` `/grants/`
    (assets are looked up without the prefix; the SPA fallback stays inside it),
    `run_worker_first: ["/grants/api/*"]` and the `BASE_PATH` var;
  - the Worker (`src/worker/http.ts`) strips the prefix before routing, so every route and middleware
    still sees `/api/...`. Better Auth gets the public path back (`authUrls`, `routes/auth.ts`): its
    endpoints are `/grants/api/auth/*` and the session cookie has `Path=/grants`;
  - `scripts/prerender.mjs`: links, `_redirects` (`/grants/ /grants/landing 200`), the `_headers`
    cache rule (`/grants/assets/*`) and `robots.txt` rules.
- **`APP_URL`** = `https://marisstella.app/grants` (repository variable `APP_URL` overrides; its path
  must equal `BASE_PATH`, the build step checks). Every emailed, Slack and calendar link is built from
  it. `SITE_URL` (canonical, `og:url`, sitemap) and `VITE_PRODUCT_URL` (the demo's "Start your own")
  use the same value.
- **Old host.** `grants.marisstella.app` stays a Custom Domain of this Worker. Every request there
  (assets outside `/grants/` never match, so the Worker runs) gets `301` (GET/HEAD) or `308` (other
  methods) to `https://marisstella.app/grants` + the path (a leading `/grants` is not doubled) + query
  (`src/worker/lib/canonical-host.ts`). Exceptions, answered on every host because their callers do not
  follow redirects and send no cookies: `/api/health*`, `/api/billing/webhook`, `/api/integrations/*`,
  `/api/internal/*` and `/api/calendar/*` (token-authenticated .ics feeds; not every calendar app follows
  redirects), with or without the prefix. Calendar event UIDs keep the pre-move host `grants.marisstella.app`
  (`calendarUidHost`) so subscribers don't see every deadline twice. `localhost` and `*.workers.dev` are never redirected,
  and neither is anything when `APP_URL` is plain http (local dev, tests).
- **Local dev and tests** run without a prefix (`BASE_PATH` empty in `wrangler.jsonc`), exactly as before.
  `BASE_PATH=/grants pnpm build` reproduces the production build.

What the catalogue Worker must do: bind this Worker as a service (`services: [{ binding: "GRANTS",
service: "grant-autopilot" }]`) and, for a path equal to `/grants` or starting with `/grants/`, return
`env.GRANTS.fetch(request)` with the request untouched (same URL, method, headers including `Cookie`
and `Origin`, body). It should not cache or rewrite the responses (they carry their own
`Cache-Control`, CSP and `Set-Cookie`). Its `/robots.txt` should carry the lines in
`dist/client/robots.txt` of a production build (`Disallow: /grants/orgs`, `/grants/api`,
`/grants/invite`, `/grants/onboarding`, and `Sitemap: https://marisstella.app/grants/sitemap.xml`).

Order of rollout: a prefixed production build makes the old host 301 to `APP_URL`, so it may only go out
once the catalogue forwards `/grants/*` here. The deploy's step "Check the catalogue forwards the base
path" probes `APP_URL/api/health` first and stops the deploy, with nothing deployed, unless it reaches
this app (the health JSON, or this app's own page from a version without the prefix). grants-monitor
probes the old host instead of `APP_URL` until the old host answers `/` with a 301, so it opens no
incident for a URL nobody uses yet.

Browser check: CI job "e2e under /grants" runs `test/e2e/06-base-path.spec.ts` with
`E2E_BASE_PATH=/grants` (sign-up, the `Path=/grants` cookie, an org, in-app navigation, no request
outside the prefix). Locally: `E2E_BASE_PATH=/grants scripts/e2e-run.sh test/e2e/06-base-path.spec.ts`.

Smoke test (`grants-deploy.yml`): it must pass `<Worker host>/grants/api/health` (the old host, or
workers.dev without a custom domain); `https://marisstella.app/grants/api/health` only warns while the
catalogue forward is not live; and it checks the old host's 301. After the move, signed-in users sign in
once more (cookies are per host), and these settings outside this repo must point at the new URLs:
Google OAuth redirect `https://marisstella.app/grants/api/auth/callback/google`, the billing webhook
`https://marisstella.app/grants/api/billing/webhook` (the old URL keeps working), the Slack command URL
(`$APP_URL/api/integrations/slack/command`, the old one keeps working), Turnstile hostnames
(`marisstella.app`) and the Cloudflare Access application (`marisstella.app/grants/admin` and
`marisstella.app/grants/api/admin`, docs/AUTH.md).

## Everyday flow: PR → merge → deploy

1. Branch, commit, push: `grants-ci` runs on the branch push.
2. Open a PR: `grants-ci` runs on the PR. e2e runs too but may fail for now (`continue-on-error`); its
   Playwright report is attached as the `playwright-report` artifact.
3. Merge: `grants-deploy` deploys production (after approval if the environment requires it).
   Deploys never run concurrently per environment and are never cancelled mid-way.

## Rollback

Every deploy (and every secret change) creates a Worker version; the deploy summary lists its id.

```sh
cd apps/grants
pnpm exec wrangler deployments list --name grant-autopilot     # what is live
pnpm exec wrangler versions list --name grant-autopilot        # recent versions
pnpm exec wrangler rollback <version-id> --name grant-autopilot -m "reason"
```

Rollback swaps code + vars only; **D1 is not rolled back**. That is why migrations must be additive /
backward compatible (expand, deploy, then contract in a later release). For data mistakes use D1 Time
Travel: `pnpm exec wrangler d1 time-travel restore grant-autopilot --timestamp <ISO time>`.
The durable fix is a revert PR merged to `main`, which redeploys through the normal pipeline.

## Secrets: where they come from

- Owner-provided secrets are uploaded with `wrangler secret bulk` from GitHub secrets (non-empty only).
- `AUTH_SECRET` (Better Auth session signing) and `INTERNAL_API_TOKEN` (`/api/internal`) are generated
  in CI when the Worker does not have them yet: `openssl rand -hex 32`, masked with `::add-mask::`, piped
  to `wrangler secret put` and never printed or stored anywhere else. An existing value is **never
  overwritten**: rotating `AUTH_SECRET` signs everyone out. If a GitHub secret with that name exists it
  is used instead (and re-applied on every deploy); set one when you need to know the value (e.g. to call
  `/api/internal` from a script). To rotate deliberately: `wrangler secret put AUTH_SECRET --name …`.
- Locally, secrets live in `.dev.vars` (gitignored; template `.dev.vars.example`).

## Local development

```sh
pnpm install                 # repo root
cd apps/grants
cp .dev.vars.example .dev.vars   # add ANTHROPIC_API_KEY, or set FAKE_EXTERNALS=true
scripts/local-db.sh          # current schema -> local D1 (idempotent; --reset for a fresh DB)
pnpm dev                     # http://localhost:5173
```

`local-db.sh` applies `drizzle-kit export --sql` rewritten to `CREATE … IF NOT EXISTS`, so it never
drops data; it does not ALTER existing tables, so after adding columns run `scripts/local-db.sh --reset`.

### Offline demo (no keys, no network)

```sh
cd apps/grants
scripts/demo.sh
```

It writes `.dev.vars` only if absent (`FAKE_EXTERNALS=true`, `INLINE_JOBS=true`, `DEMO_MODE=true`,
random `AUTH_SECRET` / `INTERNAL_API_TOKEN`), prepares the local D1 and starts `pnpm dev`. Sign up, then
`POST /api/demo/seed` creates the fictional **Example Valley Trades Collective** for the signed-in user
(documents with extracted facts, a few confirmed facts, two projects, the sample grant catalog and match
scores) and returns `{ orgId }`. It is idempotent per user and returns 404 in production unless
`DEMO_MODE=true` or `FAKE_EXTERNALS=true`.

**One-click live demo** (demo deployment only: `DEMO_MODE=true` *and* `FAKE_EXTERNALS=true`, else 404).
The marketing CTA (`components/demo/try-live-demo.tsx`) links production visitors to the demo host
(`VITE_DEMO_URL`); there it calls `POST /api/demo/start`, which creates a throwaway, verified
`demo-<random>@demo.invalid` user through Better Auth (session cookie included), runs the seed and
records the pair in `demo_sessions` for 24 hours. Limits: 5 starts per IP per hour (per isolate) and 500
active sessions (`DEMO_MAX_SESSIONS` var; 503 `demo_full` beyond). The hourly demo cron (`41 * * * *`)
runs `demo.cleanup_expired`: up to 15 expired sessions per run lose their org (rows, R2 files, vectors)
and user. Only users with a generated demo address and orgs marked for that session (or whose only
member is that visitor) are ever deleted.

## Reference

| Resource      | production                              | demo                                         |
| ------------- | --------------------------------------- | -------------------------------------------- |
| Worker        | `grant-autopilot`                       | `grant-autopilot-demo`                       |
| D1            | `grant-autopilot`                       | `grant-autopilot-demo`                       |
| R2            | `grant-autopilot-files`                 | `grant-autopilot-demo-files`                 |
| Vectorize     | `grant-autopilot-chunks`                | `grant-autopilot-demo-chunks`                |
| Queues        | `grant-autopilot-jobs` (+ `-dlq`)       | `grant-autopilot-demo-jobs` (+ `-dlq`)       |
| Workflow      | `grant-autopilot-application-pipeline`  | `grant-autopilot-demo-application-pipeline`  |
| Rate limits   | namespaces 1001-1003                    | namespaces 2001-2003                         |
| Crons         | discovery + follow-ups                  | hourly demo-session cleanup                  |
| URL           | `$APP_URL` (`https://marisstella.app/grants`); Worker host `https://$APP_DOMAIN/grants` (301s everything else) or workers.dev | `https://$DEMO_DOMAIN` or workers.dev (no prefix) |

`node scripts/provision.mjs --env demo --dry-run` prints what provisioning would do without changing
anything. The per-environment deploy config is derived from the Vite build output
(`dist/grant_autopilot/wrangler.json`) by `provision.mjs --write-config`.
