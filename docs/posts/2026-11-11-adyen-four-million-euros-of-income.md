---
title: "Four million euros of income that wasn't: Adyen's own sample report"
seo_title: "Adyen settlement details report Balancetransfer reconciliation"
date: 2026-11-11
description: "Run through the ai-bookkeeper's payout reader, Adyen's published sample settlement report booked a EUR 4.0M balance carry as income. The fix: every batch has to tie."
tags: [ai-bookkeeper, adyen, reconciliation, payments, bookkeeping]
---

The ai-bookkeeper splits a payment processor's payout into the sales, refunds
and fees behind it, so the bank line of EUR 74.20 lands in the books as EUR
75.00 of sales and EUR 0.80 of costs. Its Adyen reader was written two weeks ago
from Adyen's column list and a fixture we made up. Today it ran on a file Adyen
made: the sample Settlement details report linked from Adyen's own docs (batch
134, 63 rows, the 64-column layout).

## What it got wrong

The sample batch has 58 `Settled` rows, three `Fee` rows and two rows of a type
the fixture never had: `Balancetransfer`. One credits EUR 4,014,796.34
"from batch 133" and the other debits EUR 4,015,315.41 "to batch 135". The old
reader filed any type it didn't recognise as other income. Here that means
EUR 4.0 million in and EUR 4.0 million out of account 4100. Because this batch
pays nothing out, nothing was posted. One batch later, when the money did
reach the bank, the split would have put the carried balance through income.

Adyen's journal-type table defines a Balancetransfer as "a balance transfer to
or from subsequent payout batches ... for batches that could not be paid out."
It's the processor's balance moving forward, not income.

## The fix: every batch ties

The reader now checks one equation per batch:

| | EUR |
|---|---|
| Carried in from batch 133 | 4,014,796.34 |
| + 58 settled sales, net | 525.27 |
| - 3 transaction fees | 6.20 |
| - carried out to batch 135 | 4,015,315.41 |
| = MerchantPayout | 0.00 |

It ties to the cent. With no payout in the batch, the 61 activity rows stay
pending, and the report names batch 135 as the one to export alongside it.
When both batches are in one export and the carry amounts match, the reader
merges them, so the payout that reaches the bank splits into every sale behind
it. If a balance was carried in from a batch the export doesn't include, that
part goes to the processor-balance account and the report says so. It never
goes to sales.

## Six more types, from the same table

Adyen's table also showed six types the reader filed wrongly:

- `DepositCorrection` and `ReserveAdjustment` move the security deposit or
  reserve. They had been booked as income.
- `CaptureFailed` was skipped as if no money moved. In fact it takes back a
  pre-financed sale.
- `SettledReversed` was income. It now reduces sales.
- `RefundFailed` and `RefundNotCleared` now undo a refund.

Types that are neither the merchant's sale nor a cost, such as `PaidOut` and
`ManualCorrected`, still go to other income, but each one now gets a problem
line asking for a decision by hand.

## What is still unmeasured

This is Adyen's demo file from a test acquirer, not a merchant's books. No
batch in it has a `MerchantPayout`. Payouts in a currency other than the
sales, and the XLSX form of the report, are untested, and Adyen warns that a
real account's report can carry extra columns. `node
ventures/ai-bookkeeper/eval/adyen-sample.mjs` fetches the sample and re-runs
the check. Details are in the
[README](../../ventures/ai-bookkeeper/README.md) under "Adyen settlement
details, on Adyen's own sample".
