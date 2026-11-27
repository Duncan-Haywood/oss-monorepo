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
| A step that fails with "PayApps not moved yet" when `ventures/payapps/apps/payapps/package.json` is absent | written before PR #19586 merged; kept so a run stops before any credential is used if the app ever moves again |
| `PAYAPPS_DOMAIN` must be a bare host name | it is interpolated into URLs and a Cloudflare API query |
| `BILLING_PROVIDER` read from the variable only (the secret fallback is dropped) | it is not a secret (the private file's own comment); one source |

## How to run it (PR #19586 merged as 02339abe0, so it can run now)

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
- Not run: the deploy itself. It runs by hand from main once this PR merges.

## What else a privileged workflow here has to touch

Each was a red check on the first push of PR #19617; each is a registry a later deploy port needs too.

| Check | What it wanted | Done |
| --- | --- | --- |
| `adversarial-gate` `workflow-escalation` | every new secret read allowlisted, in a PR merged first | PR #19610 |
| `ci-policy` (`test_ci_policy_check` RealTree) | every file the secret-holding job runs has a code owner | `/ventures/payapps/` in `.github/CODEOWNERS`, as `/platform/email/` is for the mail deploy |
| `secrets-inventory-ci` (inventory) | each secret listed with workflows and environments | `docs/security/secrets-inventory.yaml`: 7 `PAYAPPS_*` entries, the Cloudflare rows gain the workflow |
| `validate` (publish surface) | a new publishing workflow classified | `publish_surface.py --write`: `dispatch`, gated on `refs/heads/main` |
| `agent-permission-harness` (test) | no new R1 finding | the harness ignores `defaults.run.working-directory`, so `scripts/provision.mjs` read as missing: written `./scripts/...` (same file); snapshot regenerated |
| `workflow-audit` and `test_dogfood_workflows` | no transformed secret | the whitespace-stripping of the token and account id is gone: a transformed value prints unmasked |
