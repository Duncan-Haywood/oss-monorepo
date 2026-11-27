# Deploying E-invoice Fix & Explain from this repository

The app's own deploy steps (what is provisioned, every secret and variable) are in
[apps/einvoice-preflight/docs/HOSTING.md](apps/einvoice-preflight/docs/HOSTING.md), "Deploying".
This file says what the move to this repository changes (task `move-einvoice-pro-public`,
`portfolio/work/tasks.yaml`).

## Done on 2026-11-27

- The paid edition, its marketing site and the two packages they import are here, under the
  all-rights-reserved notice, with `.github/workflows/einvoice-pro-ci.yml` (read-only, no secrets)
  running what private-monorepo's `einvoice-preflight-ci` and `einvoice-site-ci` ran.
- The pre-publication audit and the fixes the public checks forced:
  [docs/reports/2026-11-27-move-einvoice-pro-public.md](../../docs/reports/2026-11-27-move-einvoice-pro-public.md).

## Done on 2026-11-27, later: the deploy workflow

`.github/workflows/priv-einvoice-pro-deploy.yml` (Actions -> `einvoice-pro-deploy`), ported from
`private-monorepo/.github/workflows/einvoice-preflight-deploy.yml` with the hardening
`priv-payapps-deploy.yml` made (SHA-pinned actions, sparse checkout without persisted credentials,
main-only job guard, secrets used as stored). Still manual only, as the private one was: no push
trigger until a first run has been checked. What changed and why:
[docs/reports/2026-11-27-einvoice-pro-deploy-workflow.md](../../docs/reports/2026-11-27-einvoice-pro-deploy-workflow.md).
It reads, in an `einvoice-production` environment (limit it to `main`):

| Name | Kind | Status here |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | secret | already in this repository for the catalogue and PayApps deploys; the app needs Workers Scripts and D1 edit (it uses no R2) |
| `EINVOICE_DOMAIN` | variable | optional; workers.dev without it |
| `EINVOICE_BILLING_PROVIDER` | variable | `none` until the owner sets the Paddle keys |
| `EINVOICE_BILLING_API_KEY`, `EINVOICE_BILLING_WEBHOOK_SECRET`, `EINVOICE_BILLING_PRICE_IDS` | secret | owner-held, Paddle |
| `EINVOICE_RESEND_API_KEY`, `EINVOICE_EMAIL_PROVIDER`, `EINVOICE_EMAIL_FROM` | secret / variable | optional; email sign-in stays off without them |
| `EINVOICE_ADMIN_TOKEN` | secret | optional; `POST /v1/admin/accounts` (operator-made accounts) |

The D1 database is created in the EU jurisdiction by `apps/einvoice-preflight/worker/provision.mjs`
(the DPA's Annex names Cloudflare as the host).

## Then

0. The launch review is done (2026-11-27, `apps/einvoice-preflight/docs/LAUNCH-REVIEW.md`); the first
   run waits on its section 4: an Impressum address and a GDPR Art. 27 representative, both the
   owner's.
1. Run `einvoice-pro-deploy` once by hand from `main`, record the URL, and point
   einvoice-site's call to action at the Worker's `/app` (ROADMAP "Next" 1 and 2).
2. Remove `apps/einvoice-preflight` and `apps/einvoice-site` from `private-monorepo` in a PR there,
   leaving a pointer here.
3. Repoint `portfolio/monetization/models.yaml` at `ventures/einvoice-pro/apps/einvoice-preflight`,
   as PayApps' did. `bets.md` row 3 points here (2026-11-27, the PR that landed this move), and
   `roadmap_claim.py` already prefers `ventures/*/apps/einvoice-preflight` over the private copy.
