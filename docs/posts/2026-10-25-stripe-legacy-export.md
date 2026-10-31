---
title: "Stripe's older export has no payout column, so we read the Transfer column"
seo_title: "Stripe's older export has no payout column: read Transfer instead"
date: 2026-10-25
description: "ai-bookkeeper refused Stripe's legacy All-transactions CSV. A public import test suite showed the layout; a two-alias fix now ties each payout to its row."
tags: [ai-bookkeeper, stripe, bookkeeping]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) splits a Stripe deposit into
sales, fees and refunds. Its payout reader expected the newer payout
reconciliation report, with an `automatic_payout_id` column.

Stripe's older "All transactions" export has no such column. It carries
`Transfer` and `Transfer Date (UTC)` instead, no reporting category, and
European files write amounts as `"-75,57"`. The reader refused it with
"No payout id column".

BananaAccounting's open import tests include real exports in that layout.
Reading them (cloned at run time, nothing copied) showed the fix is two
aliases. On the legacy file all five payouts now tie to the report's own
payout row, and reserve rows held back with no transfer stay pending.

Limit: the new test uses made-up rows in that layout, not a real merchant's
file.
