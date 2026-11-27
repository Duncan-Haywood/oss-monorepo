# Deploying PayApps from this repository

The app's own deploy steps (what the workflow provisions, every secret and variable) are in
[apps/payapps/docs/DEPLOY.md](apps/payapps/docs/DEPLOY.md). This file says what the move to this
repository changes (task `move-payapps-public`, `portfolio/work/tasks.yaml`).

## Done on 2026-11-27

- The code, the marketing site and the packages they import are here, under the all-rights-reserved
  notice, with `.github/workflows/payapps-ci.yml` (read-only, no secrets) running the same checks
  private-monorepo's `payapps-ci`, `payapps-site-ci`, `billing-ci` and `qbo-sync-ci` ran.
- The pre-publication audit's output for the copied commit:
  [docs/reports/2026-11-27-move-payapps-public.md](../../docs/reports/2026-11-27-move-payapps-public.md).

## Not yet: the deploy workflow

`private-monorepo/.github/workflows/payapps-deploy.yml` (and `payapps-site-deploy.yml`) are not ported
yet. A port is a `priv-payapps-deploy.yml` here, because it holds secrets and writes to Cloudflare, so
it goes through the control-plane tier of `adversarial-gate` in its own PR. It needs, in a
`payapps-production` environment limited to `main`:

| Name | Kind | Status here |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | secret | the catalogue deploy already has a Cloudflare token in this repository; the PayApps deploy needs Workers Scripts, D1 and R2 edit on it (or a token minted for it by `platform/ci/cloudflare_mint/`) |
| `PAYAPPS_DOMAIN` | variable | optional; workers.dev without it |
| `PAYAPPS_BILLING_PROVIDER` | variable | `none` until the owner sets the Paddle keys |
| `PAYAPPS_BILLING_API_KEY`, `PAYAPPS_BILLING_WEBHOOK_SECRET` | secret | owner-held, Paddle |
| `PAYAPPS_QBO_*` | secret / variable | optional, QuickBooks |

**Payments stay behind for now.** The AWS payments account trusts only `private-monorepo`'s OIDC
tokens (`products-to-public-repo` notes). PayApps' Paddle checkout and webhook run inside its own
Worker on the secrets above and do not use that AWS account, so the Worker can deploy from here; the
payments-account infrastructure stays in `private-monorepo`, as `LICENSING_TRANSITION.md` says.

## Then

1. Port the deploy workflow (its own PR), run it once by hand, and record the URL.
2. Remove `apps/payapps`, `apps/payapps-site` and the four packages from `private-monorepo` in a PR
   there, leaving a pointer here (the other apps that import `packages/billing` or
   `packages/admin-metrics` keep private copies until they move too).
3. Done 2026-11-27: `portfolio/monetization/models.yaml`, `portfolio/flagships.yaml`, `bets.md`,
   the router's Deepen task and `roadmap_claim.py` point at `ventures/payapps/apps/payapps`
   (claims are `claim/payapps/*` branches on this repository from now on; the old ones in
   `private-monorepo` were all past their six hours).
