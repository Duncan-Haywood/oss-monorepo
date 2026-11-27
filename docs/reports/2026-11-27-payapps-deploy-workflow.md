---
kind: milestone
date: 2026-11-27
---
# PayApps deploy workflow ported to this repository (2026-11-27)

**What:** `.github/workflows/priv-payapps-deploy.yml`, the deploy for PayApps (paid bet #1), ported
from `private-monorepo/.github/workflows/payapps-deploy.yml`. It is step 1 of "Then" in
`ventures/payapps/DEPLOY.md` (added by PR #19586, the code move; task `move-payapps-public`).

**Why:** PayApps passed its launch review (private-monorepo PR #444, `apps/payapps/docs/LAUNCH-REVIEW.md`)
and an agent may open sign-ups on the Free plan, but its only deploy run (private run 45921558751,
2026-11-27 01:15 UTC) ended in 7 s with `runner_id: 0`: private-monorepo's Actions start no jobs
(`python3 platform/ci/ci_starvation.py --repo Duncan-Haywood/private-monorepo --run 45921558751`,
exit 1). This repository's runners do start jobs. Until a deploy runs, the top bet cannot take a
sign-up, let alone a dollar.

## What changed from the private workflow

All hardening; the deploy steps themselves (provision D1/R2, migrations before code, Paddle catalog
sync when the key exists, `wrangler deploy`, non-empty secret sync, `AUTH_SECRET` generated once,
`/api/health` smoke test, summary) are unchanged.

| Change | Why |
| --- | --- |
| Job runs only when `github.ref == refs/heads/main` | `workflow_dispatch` can be started on any branch; a branch run would ship unreviewed code with production secrets |
| Actions pinned by SHA (the same pins as `payapps-ci.yml`), `persist-credentials: false`, sparse checkout of `ventures/payapps` | this repository's workflow rules; the deploy needs nothing else |
| Cloudflare secret names `CLOUDFLARE_API_TOKEN \|\| CLOUDFLAREAPITOKEN \|\| CLOUDFLARERESTRICTEDAPIKEY` and `CLOUDFLARE_ACCOUNT_ID \|\| CLOUDFLAREACCOUNTID` | the names the other `priv-*` deploys here read (`priv-email-deploy.yml`) |
| `runs-on: vars.CI_RUNNER \|\| ubuntu-latest` | this repository's runner variable, not private-monorepo's `CODEBUILD_RUNNER` |
| A step that fails with "PayApps not moved yet" when `ventures/payapps/apps/payapps/package.json` is absent | this file can land before PR #19586; a run then stops cleanly before any credential is used |
| `PAYAPPS_DOMAIN` must be a bare host name | it is interpolated into URLs and a Cloudflare API query |
| `BILLING_PROVIDER` read from the variable only (the secret fallback is dropped) | it is not a secret (the private file's own comment); one source |

## How to run it, once PR #19586 is on main

1. Actions, `payapps-deploy`, Run workflow, branch `main`. Leave `skip_checks` off for the first run.
2. The environment `payapps-production` is created on first use. Limit it to `main` (Settings,
   Environments) and put any `PAYAPPS_*` secrets there. None are needed for the Free plan.
3. The run summary prints the URL (`https://payapps.<account subdomain>.workers.dev` without
   `PAYAPPS_DOMAIN`). Record it in `ventures/payapps/DEPLOY.md` and `portfolio/monetization/mrr.yaml`.
4. If the health check warns `email: false`, sign-ups cannot finish (production requires a verified
   address). The fix is `apps/payapps/docs/EMAIL.md`, not a second deploy.

**Token permissions are unverified from here.** The repository's Cloudflare token deploys the
catalogue and the email Worker (D1, Workers); whether it also has R2 edit is unknown. Without R2 the
deploy goes on with attachments off (provision step), so it does not block the first run.

## Verification

- `python3 platform/ci/validate_workflows.py`: all workflow files valid.
- YAML parses; every `uses:` is SHA-pinned; `permissions: contents: read`; `timeout-minutes: 30`.
- Not run: the deploy itself. It needs PR #19586 on main and runs by hand.
