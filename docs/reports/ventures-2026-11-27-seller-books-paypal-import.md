---
kind: milestone
date: 2026-11-27
---
# Seller Books: PayPal Activity download import (2026-11-27)

What landed: platform `paypal` (`src/shared/enums.ts`), importer
`ventures/seller-books/apps/seller-books/src/worker/services/importers/paypal.ts`, report key
`paypal_activity_download`, fee source entry, fixture `test/fixtures/paypal-activity-download.csv`, six unit
tests, IMPORTERS.md "PayPal", Terms non-affiliation sentence (wording only, policy version not bumped).

For the next run:

- **Source.** Column names and meanings are from PayPal's own field reference
  (developer.paypal.com/reports/activity-download and /reports/reference/t-codes; both `.md` URLs answer
  from the cloud proxy with curl). paypal.com's fee page answered 403 from the proxy.
- **Not confirmed:** the exact `Type` spellings in a real CSV (matched by words: payment/checkout/purchase,
  refund/reversal/chargeback, fee, hold/release/authorization, withdrawal/transfer/deposit/conversion) and
  the sign of `Fee` on refund rows (read as PayPal signs it: positive = given back). Run one real download
  through it before relying on it.
- **Double counting** is guarded two ways: a payment whose `Name` is a marketplace Seller Books imports is
  skipped (and its refunds), and a fee row whose `Reference Txn ID` points at a payment that already carries
  a `Fee` is skipped.
- **Next, if sellers ask:** Venmo's statement CSV (header row on line 3 in newer exports; columns ID,
  Datetime, Type, Status, Note, From, To, Amount (total), Amount (fee) per beancount-import and finance-dl,
  not yet checked on a Venmo page), PayPal Zettle.
- PayPal counts as a platform for the plan limit (Free = 1), like Square.
