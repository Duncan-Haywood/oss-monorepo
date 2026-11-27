# PayApps launch switch for the free guides (bet #1)

2026-11-27, ventures run. For whoever runs the first good `payapps-deploy`.

## What was missing

The 30 pages of `ventures/pay-app-guides` (bet #1's free front door) each end with a card about
the paid app, but every one said, by hand, "in development, with early access; nothing is for
sale yet" and linked to the construction industry page. Nothing linked to the app, and nothing
in the app could open on sign-up from a link: the signed-out home page always showed "Sign in".
Once the first deploy succeeds (PR #19628 fixes the R2 failure of run 45947552522), switching 30
pages by hand would be the slowest part of opening the funnel and the easiest to get half done.

## What landed

- **App:** `/?signup` (any value but `0`, `false`, `no`) opens the signed-out home page on
  "Create an account" (`ventures/payapps/apps/payapps/src/client/lib/auth-mode.ts`, 3 tests).
- **Guides:** `ventures/pay-app-guides/cta.mjs` writes each card's lead and status sentence.
  `APP_URL = null` (now) keeps the visible text exactly as it was, inside
  `<!-- cta-status -->` markers. With a URL, every page reads "PayApps is hosted ... It is
  open now: free on one job, no card; paid plans for more jobs are not on sale yet. Start free in
  PayApps" and links to `<APP_URL>/?signup&from=pay-app-guides/<page>`. `PAID_PLANS_ON = true`
  adds "$99 to $249 a month" once Paddle checkout is live. Reversible: setting `APP_URL` back to
  null restores the pre-launch text byte for byte (checked on all 30 pages).
- `page.test.mjs` now fails if a page's card is not what `cta.mjs` writes.

## Launch day, in order

1. `payapps-deploy` succeeds; read the URL from its summary and check `GET /api/health`.
2. Set `APP_URL` in `ventures/pay-app-guides/cta.mjs`, run `node cta.mjs` in that directory,
   run `python3 platform/ci/run_venture_tests.py pay-app-guides`.
3. Same PR: the "Can I buy the pay-app suite today?" answer in
   `platform/pages/industry-construction.mjs`, and the payapps-site copy if that site is deployed
   by then (it still says early access and has no deploy workflow here).

## Not done

- The `from` parameter is not stored by the app yet. A sign-up source report would need the
  client to pass it to sign-up and a column to keep it; worth doing once there are sign-ups.
- The workers.dev address contains the account's subdomain; a custom domain
  (`PAYAPPS_DOMAIN`) would be a better public link before the switch, if the owner sets one.
