# Deploying CMMC Workspace from this repository

What the deploy does, step by step, and every setting are in
[`apps/cmmc/docs/DEPLOY.md`](apps/cmmc/docs/DEPLOY.md). This file says what the move to this
repository changes. The marketing site (`apps/cmmc-site`) has no deploy workflow anywhere yet; its
README, "Deploy (owner)", lists the wrangler steps.

## The port (2026-11-27)

[`.github/workflows/priv-cmmc-deploy.yml`](../../.github/workflows/priv-cmmc-deploy.yml) was ported from
private-monorepo's `cmmc-deploy.yml`, which never ran because that repository's Actions start no jobs.
It follows `priv-seller-books-deploy.yml` and the Job Shop Quote port (R2 optional since 2026-11-27: evidence goes to D1 without it), after an
allowlist PR for its secrets (PR #19741, the pattern Seller Books followed in PRs #19653 and #19662).
It runs by hand only (`workflow_dispatch`), refuses any ref but `main`, and uses the
`cmmc-production` environment. `/ventures/cmmc/` now has a code owner, because the deploy job runs
the venture's code with Cloudflare credentials (`ci_policy_check.py`).

Differences from the private workflow:

- The host defaults to `cmmc.marisstella.app` (`CMMC_DOMAIN` overrides it), as PayApps and Seller
  Books use `<app>.marisstella.app`. A zone the token cannot reach falls back to workers.dev.
- AI drafts read only `CMMC_ANTHROPIC_API_KEY`, never the shared `ANTHROPIC_API_KEY`, so no LLM
  spend starts until the owner sets a key for this app.
- `CMMC_GLOBAL_DAILY_LLM_CAP_USD`, when set, goes to the Worker as `GLOBAL_DAILY_LLM_CAP_USD` (a
  number, or `off`; anything else stops the run before deploying). Unset keeps the code's $1.50 a day.
- The smoke test warns when `CMMC_BILLING_PROVIDER=paddle` but `/api/health` reports
  `billing:false`, as well as when `email:false`.

Settings (names only; values are never in the tree; full table in `apps/cmmc/docs/DEPLOY.md`):

| Name | Kind |
| --- | --- |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | secrets (the account id may be a variable); shared with the other apps |
| `CMMC_DOMAIN`, `CMMC_EMAIL_FROM`, `CMMC_BILLING_PROVIDER` | variables, all optional |
| `CMMC_ANTHROPIC_API_KEY`, `CMMC_AUTH_SECRET` | secrets, optional |
| `CMMC_BILLING_API_KEY`, `CMMC_BILLING_WEBHOOK_SECRET`, `CMMC_BILLING_PRICE_IDS` | secrets, paid plans only |
| `CMMC_GLOBAL_DAILY_LLM_CAP_USD` → Worker `GLOBAL_DAILY_LLM_CAP_USD` | optional variable; unset keeps the code's $1.50 a day (`apps/cmmc/docs/LAUNCH-REVIEW.md`, section 1) |

Cron budget: the Worker has one daily cron (affirmation reminders). With PayApps, Seller Books, the
email Worker and Job Shop Quote deployed, this makes five, the Cloudflare free plan's per-account
limit (PR #19732, `platform/ci/cron_budget.py`). A sixth cron Worker needs the site purge crons
folded or Workers Paid (backlog P098).

Payments: the Paddle webhook is served by the app's own Worker, so nothing payments-side has to stay
in `private-monorepo` except owner checklists. The app deploys with a Cloudflare token, not the
payments account's OIDC trust, so that trust is not affected.

## First deploy (2026-11-27, run 46022366507)

Dispatched on `main` at `bae2bd14` (after PR #19771, evidence in D1 without R2). Checks, build,
provisioning, D1 migrations, the Paddle catalog step (a no-op with billing off), the deploy and the
AUTH_SECRET step all passed, and the Worker attached the default custom domain:
`https://cmmc.marisstella.app/api/health` answered
`{"ok":true,"app":"cmmc-workspace","billing":false,"email":true,"files":"d1"}`. So sign-up email
works, evidence files are kept in D1 (no R2 bucket; add R2 edit to the token before shops fill it),
paid plans are dark (no `CMMC_BILLING_*`), and AI drafts are off (no `CMMC_ANTHROPIC_API_KEY`: "Draft"
answers that drafting is not configured). A second dispatch a second later (run 46022369260) was
cancelled by the workflow's concurrency group before it started.

Front doors since then: the 21 machine-shop guides (`ventures/machine-shop-guides/cta.mjs`), the
products page and the manufacturing tool doors link to `/?signup&from=<page>`, which opens "Create an
account" (`apps/cmmc/src/client/lib/auth-mode.ts`). That change reaches the live app on the next
deploy: the workflow is manual, so dispatch it once more after the PR that carries it merges.

## Then

The product side of launch is reviewed: [`apps/cmmc/docs/LAUNCH-REVIEW.md`](apps/cmmc/docs/LAUNCH-REVIEW.md)
(2026-11-27, PR #19734), the record `docs/legal/OPERATOR.md` asks for before an agent deploys and
opens sign-ups.

1. Done 2026-11-27 ("First deploy" above). Next: add `push: branches: [main]` with a paths filter
   after a second good run, as `priv-payapps-deploy.yml` does.
2. Remove `private-monorepo/apps/cmmc` and `apps/cmmc-site` in a private PR, repoint
   `portfolio/monetization/bets.md` ("Where it is built") and the `private-monorepo/apps/cmmc` row
   key in `portfolio/monetization/models.yaml`.
