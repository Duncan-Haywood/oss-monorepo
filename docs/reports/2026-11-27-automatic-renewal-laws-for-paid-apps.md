---
kind: note
date: 2026-11-27
subjects: [seller-books]
---
# Automatic-renewal laws for the paid apps (2026-11-27)

For the next run that touches a paid app's checkout. Seller Books (bet #5) now does this, in PR #19817.
The rest of the paid apps don't yet.

## What the laws ask

An agent read these on 2026-11-27. No lawyer has reviewed this. Sources are in
`ventures/seller-books/apps/seller-books/docs/BILLING.md`, "Automatic renewal".

- **Colorado, C.R.S. 6-1-732.** This is the operator's home state, and it applies to sales to *consumers*.
  - The terms must be shown next to the buy button.
  - The buyer gets a written acknowledgment.
  - Cancelling online takes one step. SB25-145 rewrote (2)(d) to require this for anyone who signed up online.
  - A notice goes out **25 to 40 days before each renewal**. For terms shorter than 12 months, it goes before each renewal that carries the plan past a 12-month period.
- **California, Bus. & Prof. Code 17602**, as amended by AB 2863 and in force from 2025-07-01.
  - The buyer gives express affirmative consent, and the proof is kept for 3 years.
  - A yearly reminder.
  - Cancelling works through the same channel the buyer signed up through.

## What Seller Books built, and how to port it

Each piece is small and self-contained:

1. `src/shared/renewal-notice.ts`: the pure window rule, covered by `test/unit/renewal-notice.test.ts`.
2. `services/billing/renewal-notices.ts`: runs on the app's daily cron, with a `renewal_notice` claim table.
3. Checkout requires `renewalConsent: true`. `pending_checkouts.renewal_terms_version` and `renewal_consent_at` record it.
4. "Cancel subscription" calls `createPortalSession(customer, returnUrl, { subscriptionId })`. That asks Paddle for `subscription_ids` and returns the `cancel_subscription` deep link. Each venture has its own copy of `packages/billing`, so this change exists only in `ventures/seller-books/packages/billing`. Port it per app.

## Which apps need it

- PayApps, Job Shop Quote, CMMC and E-invoice sell to businesses. Their `docs/legal/OPERATOR.md` keeps Colorado as an "open check" for consumer sales.
- A sole-proprietor subcontractor buying PayApps is still a business buyer under Colorado's "personal, family, or household" definition. So for those apps this is lower risk, but cheap to add.
- Seller Books came first because resellers are often consumers.

## Found on the way

The estimated-tax reminder email linked to `/orgs/<id>/estimated-tax`. That is not a route: the SPA's org
routes are `/o/<id>/…`. Before writing a link into an email, check its path against `src/client/router.tsx`.
