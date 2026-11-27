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

## First run (2026-11-27, run 45947552522)

Dispatched on `main` after PR #19617. It got a runner, passed install, checks and build, resolved
`https://payapps.<account subdomain>.workers.dev`, then stopped in provisioning: the repository's
Cloudflare token is refused on R2 (`Authentication error [code: 10000]`). `provision.mjs` now treats
that like R2 not enabled (deploy without attachments, with a warning naming the missing permission),
so the next run gets past it. Since 2026-11-27 attachments work without R2, kept in D1 with a 50 MB per
company and 300 MB total cap (`apps/payapps/docs/DEPLOY.md`, step 3). Owner step before companies fill
that: add Account -> Workers R2 Storage -> Edit to `CLOUDFLARE_API_TOKEN`.


## Runs 2 and 3 (2026-11-27)

- Run 45949861746 (after PR #19625) **deployed**: provisioning, D1 migrations, the deploy (version
  `e9f3df29-1349-4b1e-8656-4d67ffc12631`) and the smoke test all passed:
  `https://payapps.duncan-andrew-haywood.workers.dev/api/health` answered
  `{"ok":true,"app":"payapps","email":true}`, so sign-up email works. No attachments (R2) and paid
  plans dark.
- Run 45950799211 (on `6e69be0e`) stopped in Checks: `test/unit/sov-import.test.tsx` timed out
  waiting for the import to post. Cause: `useMutation` takes new options in an effect, so a click
  landing between the render that shows the preview and that effect ran the earlier render's
  `mutationFn`, which saw no result. The SOV import and the P6 schedule import now pass what they
  post to `mutate()` instead of reading component state inside `mutationFn`. Write new
  `mutationFn`s the same way when the button appears in the render that an async read (a file, OCR)
  sets.

## Custom domain (2026-11-27, run 45963162134)

PR #19642 made `payapps.marisstella.app` the default `APP_DOMAIN`. The token reaches the zone, so the
run attached it as a Workers custom domain and, as `provision.mjs` does with a domain, turned
workers.dev off: the workers.dev address above no longer answers. Smoke test:
`https://payapps.marisstella.app/api/health` -> `{"ok":true,"app":"payapps","email":true}`, version
`63e5c302-8959-4a38-a68e-5fc53ea9d49b`. Every guide CTA, the construction page and llms.txt now link
to the custom domain.
