---
title: "A Square refunded fee is a fee credit, not a customer refund"
date: 2026-11-03
description: "Checking ai-bookkeeper's Square payout reader against Square's published list of activity types fixed fee credits, app fees and reserve movements."
tags: [ai-bookkeeper, square, bookkeeping]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) splits a Square payout into
sales, refunds, fees and clearing. It chose the bucket by keyword, so any type
containing "refund" counted as a customer refund. Square's OpenAPI spec lists
60 activity types, and the keywords got several wrong:

- `PROCESSING_FEE_REFUND`, `THIRD_PARTY_FEE_REFUND` and the subscription fee
  refunds are fee credits. They were booked as refunds to customers.
- `APP_FEE_REVENUE` is income for an app developer. It was booked as a fee.
- Reserve holds, Square Capital payments, card repayments, automatic savings
  and moves between balances are not income. They went to "other income".

The reader now has an explicit table for these types. The balance movements go
to the clearing account, and unknown types fall back to the old keywords. The
test uses hand-made entries, so no real Square API response has been tried yet.
