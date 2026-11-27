---
kind: milestone
date: 2026-11-27
---
# E-invoice Fix & Explain deploy workflow ported to this repository (2026-11-27)

**What:** `.github/workflows/priv-einvoice-pro-deploy.yml` (`einvoice-pro-deploy`), the deploy for
E-invoice Fix & Explain (paid bet #3), ported from
`private-monorepo/.github/workflows/einvoice-preflight-deploy.yml` (blob `e66eb6bf`). It was the
"Not yet" in `ventures/einvoice-pro/DEPLOY.md` after the code move (PR #19707). PayApps, Job Shop Quote, Seller Books
and (merged while this run worked) CMMC each have a `priv-*-deploy.yml` here.

**Why:** private-monorepo's Actions start no jobs (see `docs/reports/2026-11-27-payapps-deploy-workflow.md`),
so without a port the paid workspace (`/app`, the metered API, checkout shipped dark) cannot be
reached by anyone, ahead of Germany's 1 January 2027 issuing mandate that the bet's timing rests on.

**Landed in two PRs**, because a change to a gate is judged by the old gate: PR #19767 added the
ten `workflow-escalation` allowlist entries (the five Cloudflare names, five `EINVOICE_*`), then
this PR added the workflow and its registries.

## What changed from the private workflow

The deploy steps are unchanged: tests, the two build modules at exact versions with `--no-save`,
`worker/build.mjs`, the token check, the URL, D1 provisioning in the EU jurisdiction, the Paddle
catalog sync when the key exists, `wrangler deploy`, non-empty secret sync, `CHECKOUT_SECRET`
generated once, smoke tests of `/healthz`, `/v1/legal`, `/app` and the three legal pages, summary.

| Change | Why |
| --- | --- |
| Job runs only when `github.ref == refs/heads/main` | a dispatch from a branch would ship unreviewed code with production secrets |
| Actions pinned by SHA (the pins `einvoice-pro-ci.yml` uses), `persist-credentials: false`, sparse checkout of `ventures/einvoice-pro` | this repository's workflow rules; the build reads nothing else (`worker/build.mjs` and `pro/` import only `ventures/einvoice-pro/packages/*`) |
| Cloudflare secrets under the three spellings the other `priv-*` deploys read; `runs-on: vars.CI_RUNNER` | this repository's names |
| Token and account id used exactly as stored (the private file stripped whitespace and re-masked) | a transformed secret prints unmasked; `workflow-audit` flags it |
| `EINVOICE_DOMAIN` must be a bare host name | it is interpolated into URLs and a Cloudflare API query |
| The Paddle sync warns on failure instead of `continue-on-error` | the same outcome (the app still deploys), visible as a warning, as in `priv-payapps-deploy.yml` |
| Health wait 300 s, not 90 s | a new custom domain's certificate can take minutes on its first deploy |
| A step that fails before any credential is used if `worker/provision.mjs` is missing | as PayApps' port: a later move cannot run half a deploy |
| The secret-sync temp file is `worker-env.json`, not `worker-secrets.json` | `adversarial-gate` reads `secrets.json` as a new secret named `JSON` (first push of PR #19773); PayApps' port uses the same name |
| Still `workflow_dispatch` only | the private workflow's own rule: no deploy on merge until a first run has been checked; then add a `push:` trigger as `priv-payapps-deploy.yml` did (PR #19676) |

Registries the privileged workflow needs (each was a red check on PayApps' first push):
`/ventures/einvoice-pro/` in `.github/CODEOWNERS` (`ci_policy_check.py`), five `EINVOICE_*` entries
and the workflow on the five Cloudflare rows in `docs/security/secrets-inventory.yaml`, and
`platform/ci/publish-surface.yaml` (`dispatch`, gated on `refs/heads/main`).

## Verification (this session)

- `python3 platform/ci/validate_workflows.py`: all 150 workflow files valid.
- `python3 platform/ci/secrets_inventory.py`: 68 secrets read by workflows, all listed.
- `python3 platform/ci/ci_policy_check.py`: 47 `priv-` workflows checked, ok.
- `python3 platform/ci/dogfood_workflows.py`: 9 checkers, no unaccepted findings.
- `agent-permission-harness/check_results_current.py`: exit 0 (no new finding).
- The build path at its new location, in `ventures/einvoice-pro/apps/einvoice-preflight`: the
  workflow's own `npm i --no-save ... slimdom@4.3.5 wrangler@4.165.0`, `node worker/build.mjs`,
  then `wrangler deploy --dry-run`: "Total Upload: 11722.77 KiB / gzip: 2128.96 KiB", binding
  `env.DB (einvoice-pro)`, exit 0. That matches the 2.0 MB gzipped `docs/HOSTING.md` recorded on
  2026-11-26, so nothing the bundle needs was lost in the move.
- Not run: the deploy itself.

## Next (for the next einvoice run)

1. **A launch review before the first run.** PayApps and Seller Books each recorded one
   (`docs/LAUNCH-REVIEW.md`) before an agent opened sign-ups; einvoice has none, here or in
   private-monorepo. The app takes sign-ups, shows Terms, a Privacy Policy and a DPA
   (`pro/legal`), and stores client invoices' hashes in D1, so review those pages against what the
   Worker does (EU jurisdiction, no IPs in logs, Time Travel backups) and record it, then run
   `einvoice-pro-deploy` from `main` with `skip_checks` off.
2. Record the URL in `ventures/einvoice-pro/DEPLOY.md` and `portfolio/monetization/mrr.yaml`, and
   point `apps/einvoice-site`'s call to action at the Worker's `/app` (ROADMAP Next 1 and 2).
3. After one good run, add the `push:` trigger (paths `ventures/einvoice-pro/**`, not `*.md`).
