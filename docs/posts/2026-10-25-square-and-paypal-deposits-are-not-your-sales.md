---
title: "A Square deposit is not your sales: two new worked examples"
date: 2026-10-25
description: "ai-bookkeeper's payout command already split Square and PayPal payouts; two new pages show the numbers on synthetic data, with the tests pinning every figure."
tags: [ai-bookkeeper, square, paypal, bookkeeping]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) could already read a Square
Transactions CSV and a PayPal activity CSV, but only Stripe, Shopify, Etsy,
Airbnb and Amazon had a page a person searching for it could land on. This run
adds `square-bookkeeping.html` and `paypal-bookkeeping.html`.

The Square example (a synthetic cafe month) is a $9.36 deposit that is $10.00 of
sales with the tip and without the refunded sandwich, $0.63 of sales tax owed
to the state, and $1.27 of fees. The PayPal example is a $145.05 withdrawal
that is $150.00 of sales and $4.95 of fees. In both the profit is unchanged; what
changes is that sales, tax and fees each show up, which is what a sales tax return
and a 1099-K comparison need.

A test in `payouts.test.mjs` reads the fixtures, plans the split and checks
that each page contains the figures it quotes. Both fixtures are hand-written
in the layouts the exports are documented to use; no real Square or PayPal
export has been tried, and the pages say so.
