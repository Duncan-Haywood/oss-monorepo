---
title: "A Square 'processing fee refund' is a fee credit, not a customer refund"
date: 2026-10-25
description: "Checking ai-bookkeeper's Square payout reader against Square's published activity types fixed how fee refunds, holds and loan repayments are booked."
tags: [ai-bookkeeper, square, bookkeeping]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) reads Square's Payouts API
entries. It classified them by regex on the type name, so anything containing
"refund" became a customer refund. Square's SDK lists 60-odd activity types.
Checked against that list, `PROCESSING_FEE_REFUND` and five other fee refunds
were wrongly booked as customer refunds, when they are credits against fees.

An explicit table now covers every listed type. App fees are sales, fee
refunds are fees, and holds, automatic savings, Square Capital repayments
and money moved between Square products go to the clearing account, not
income. A type Square adds later still falls to "other income" and is not
guessed at. One new test pins ten of the types. Still untried on a real
Square export.
