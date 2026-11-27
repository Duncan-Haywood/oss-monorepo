---
kind: milestone
date: 2026-11-27
---
# PayApps' Paddle checkout page, as code (2026-11-27)

**What was missing.** PayApps (paid bet #1) is live on the Free plan, its Paddle catalog syncs on
every deploy (six live price ids), and its notification destination exists. One thing stood between
that and a working live checkout, and no file said so: a Paddle Billing checkout is a *payment link*,
`<page>?_ptxn=<transaction id>`, and that page must be on a domain the Paddle account approved and
must load Paddle.js with a client-side token. Paddle also refuses to create any transaction while the
account has no default payment link. PayApps had no such page, no token and no default link, so
switching on `PAYAPPS_BILLING_PROVIDER=paddle` would have sent the first paying customer to a page that
could not take the payment. Source: developer.paddle.com, "Set your default payment link",
"Create a client-side token", "Update checkout URL settings", "Create a transaction" (`checkout.url`),
all read 2026-11-27.

**What landed (slug `paddle-checkout-page`).**

- `packages/billing/src/paddle-checkout-page.ts` (+ tests, + `scripts/paddle-checkout-page.ts`), in
  all five billing copies (`platform/ci/check_billing_copies.py` holds them identical): find the active
  client-side token named `<app> checkout` or create it; set the account's default payment link to
  `<APP_URL>/pay` **only when the account has none** (one Paddle account serves several apps); report
  `checkout_url_domain_not_approved` and missing permissions in words, without failing.
- `paddle.ts`: `createCheckout` sends `checkout: { url }` when the request carries
  `checkoutPageUrl`. PayApps passes `<APP_URL>/pay/<org id>`, so the buyer returns to that org's
  Billing page whatever the account's default link is.
- PayApps Worker: `GET /pay` and `/pay/:orgId` (`src/worker/routes/pay.ts`), outside `/api`, so
  `wrangler.jsonc` runs the Worker first on them. Loads `cdn.paddle.com/paddle/v2/paddle.js`, our
  script as a same-origin file (no inline script), its own CSP limited to Paddle's hosts, and COOP
  `same-origin-allow-popups` (everything else keeps `same-origin`). Paddle.js opens the overlay for
  `_ptxn` by itself; completed goes to `?checkout=success`, closed to `?checkout=cancel`.
- `src/worker/ports/billing.ts`: with `BILLING_PROVIDER=paddle` but no valid `BILLING_CLIENT_TOKEN`,
  billing is null, so checkout stays off rather than half-working.
- `priv-payapps-deploy.yml`: a "Paddle checkout page" step after the notification destination; the
  token reaches the Worker through a 0600 file in the existing secret sync; the summary prints the state.

**Verified.** packages/billing: 121 tests (payapps copy), 97–100 in each other copy. PayApps: 1,444 unit
and 597 worker tests, `tsc`, biome, `pnpm build` (the built config keeps `/pay` Worker-first).
`validate_workflows.py`, `ci_policy_check.py`, `secrets_inventory.py`, `dogfood_workflows.py` clean.
In Chromium, the page under its own CSP with the live Paddle.js (2.13.0): Paddle.js loaded, opened the
`sandbox-buy.paddle.com` checkout frame for the `_ptxn` transaction unprompted, and with a made-up token
Paddle's checkout service answered 403, which the page reported ("Nothing was charged"). No CSP
violations. **Not verified:** a real purchase. The next deploy is the first to call the client-token
and checkout-URL endpoints with the live key; its log says whether the key has `client_token.*` and
`checkout_settings.*`.

## For the next run

1. Read the first deploy's "Paddle checkout page" log line. "permission" means the owner adds
   `client_token.read/write` and `checkout_settings.read/write` to `PADDLE_API_KEY`.
   `checkout_url_domain_not_approved` means the host still needs approval.
2. **Owner, in the Paddle dashboard (no API):** approve the exact host `payapps.marisstella.app`
   under Settings > Website approval. A subdomain is not covered by an approved `marisstella.app`.
3. Then `PAYAPPS_BILLING_PROVIDER=paddle` (a repository variable) turns checkout on. The deploy then
   activates the notification destination, and `/api/billing/plans` answers `checkoutAvailable: true`.
   Make one real purchase on the Solo plan and refund it, then set `PAID_PLANS_ON` on the marketing
   site and in `pay-app-guides/cta.mjs` (ROADMAP, "Must do before a public launch").
4. Seller Books, CMMC, Job Shop Quote and E-invoice have the same module in their billing copies;
   each needs its own `/pay` page and deploy step before its checkout can work.
