---
title: "A returned Etsy deposit was booked as a negative fee"
date: 2026-10-25
description: "Reading Etsy's OpenAPI spec for ledger entry kinds showed ai-bookkeeper's Etsy reader had no place for a returned disbursement."
tags: [ai-bookkeeper, etsy, payouts]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads Etsy's payment-account
ledger and splits each deposit into sales, refunds and fees. Etsy's OpenAPI v3
spec lists the kinds of ledger entry: payment, refund, reversal of a failed
refund, disbursement, returned disbursement, recoupment, miscellaneous
credit and debit, and bill payment.

The reader knew the first few. A returned disbursement (a bank rejects a
deposit and the money comes back) fell through to "other", which the reader
books as a fee. A positive net became a negative fee, so the books showed a
credit that was really cash returning to Etsy's balance.

The reader now flags it, and recoupments, with a message to book them against
the bank by hand. The money stays in the activity the next deposit pays out, so
that deposit still splits. One new test pins it.

Limits: the spec describes the API ledger, not the CSV, so the CSV's Type
spellings are still unchecked, and no real Etsy export has been tried.
