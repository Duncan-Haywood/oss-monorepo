---
kind: note
topics: [redteam]
date: 2026-11-27
---
# Red team 2026-11-27: Paddle webhook sync and checkout tokens in the payapps billing package

Targets (bet #1, payapps): `ventures/payapps/packages/billing/src/paddle-webhook.ts`
(the notification-destination-as-code sync, new this week) and
`ventures/payapps/packages/billing/src/checkout-token.ts` (the token that binds a
Paddle subscription to an org). Step 0 had nothing open (one entry blocked on an
eval set, skipped).

## Seeded faults

`paddle-webhook.ts`: 8 mutants, 6 caught, 2 escaped, both gaps:

- `body.api_version = 1` -> `2` in the update plan: no test had a destination on
  another API version. Added "moves a destination on another API version back to
  version 1".
- `existing?.active ?? false` -> `?? true`: no test read the reported `active` of a
  plan-only run that would create the destination (the deploy log would have said
  "active" for a destination that does not exist yet). Added "plan only reports a
  destination it would create as inactive, whatever is wanted".

`checkout-token.ts`: 8 mutants, 7 caught, 1 escaped, equivalent: it changed the
`ok: false` literal inside the `TokenResolution` type, which Node strips at load.
`tsc --noEmit` (the package's `typecheck` script, not part of `npm test`) would
reject it.

Catch rate 13/15 non-equivalent = 0.867 before, 1.0 after (`redteam.py rerun`).

## Real defect, fixed in all five billing copies

`resolveCheckoutToken` rejected an expired row with
`row.expiresAt.getTime() <= now.getTime()`. For an Invalid Date, `getTime()` is
`NaN`, every comparison with `NaN` is false, so the token **never expired**: a
security check that fails open. It is latent today (the app writes
`new Date(now + 24h)` into a NOT NULL column), but a corrupt row, a schema change or
a port that maps a missing column to `new Date(undefined)` would turn a 24-hour token
into a permanent one. Now `!(expiresAt > now)`, so `NaN` counts as expired, with a
test that failed first.

The same file is copied into cmmc, einvoice-pro, jobshop-quote and seller-books.
`platform/ci/check_billing_copies.py` (added by an earlier red-team run) failed on
the payapps-only fix ("checkout-token.ts: billing copies differ ... port the change
to every copy"), which is exactly what it exists for; the fix and its test are now
in all five copies and every suite passes (130, 106, 107, 103, 106 tests).

## For the next run

- The same `x <= now` shape appears in `packages/qbo-sync/src/oauth.ts:246`
  (payapps and jobshop-quote) for the refresh-token expiry. A `NaN` there only means
  we ask Intuit to refresh a token Intuit then refuses, so it is not a fail-open;
  left as is.
- `npm test` in the billing packages does not run `tsc`, so type-only mutants read
  as escapes. Running the typecheck in CI for these packages would turn them into
  catches; check whether `ventures-tests.yml` already runs `typecheck` before adding it.
