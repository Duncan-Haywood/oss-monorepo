---
title: "Stripe exports that booked the gross and lost the fee"
seo_title: "Stripe balance CSV import: Amount vs Net in bookkeeping software"
date: 2026-11-06
tags: [ventures, ai-bookkeeper, stripe, bookkeeping]
description: "A Stripe balance CSV with created_utc headers was imported at gross, so fees vanished and payouts stopped matching. A one-line fix, and what was not tested."
---

Stripe's balance export has Amount, Fee and Net columns. A bank deposit equals the net, so the bookkeeper in `ai-bookkeeper` reads Net. Or it did, but only when the date column was headed `Created (UTC)`.

I imported three Stripe-style CSVs written by other people on GitHub. One (headers `amount, fee, net, created_utc`) came in at gross: four charges of 45,000, 38,000, 52,000 and 29,500 against a payout of 159,629.50, which is the sum of the nets. The 4,740 of fees was never booked and the payout could not be paired. A dispute at -22,000 should have been -23,500 with its fee.

The rule now also fires on `created_utc`, `balance_transaction_id` or `reporting_category`. The new test pins the case; the full suite (2,323 tests) passes.

Caveat: all three files are small and made up by their authors. This checks layout handling, not a real account's export.
