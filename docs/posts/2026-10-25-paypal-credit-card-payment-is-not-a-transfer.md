---
title: "A PayPal 'Credit card payment' is a sale, not a transfer"
date: 2026-10-25
description: "Running all of PayPal's documented transaction types through ai-bookkeeper's built-in rules found a customer payment booked as a transfer."
tags: [ai-bookkeeper, paypal, bookkeeping]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) imports PayPal's activity CSV as
"Name - Type" lines. PayPal publishes the full list of its transaction types
(157 event codes). We ran each description through the keyword layer, once as
money in and once as money out.

One fault mattered: `Credit card payment` (a customer paying you by card) was
booked as a transfer, because the rule for paying off your own credit card
matched the words. Nine other sale types and six fee types were left blank, and
withdrawals to your bank and currency conversions were not seen as transfers.

Four rules, anchored on the type at the end of the line, fix those; the plain
bank wording (`PAYMENT THANK YOU`, `CREDIT CARD PAYMENT` on a statement) is
unchanged. Holds, refunds and tax withholding are left for review on purpose.

Caveat: this is PayPal's reference, not a real export. The CSV's Type column
may spell some types differently, so the next step is a real activity file.
