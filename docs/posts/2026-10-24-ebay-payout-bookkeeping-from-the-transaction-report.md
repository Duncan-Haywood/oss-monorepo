---
title: "Bookkeeping an eBay payout: what the Transaction report already knows"
date: 2026-10-24
description: "An eBay deposit is one lump on the bank statement. The Seller Hub transaction report lists every order, label and fee behind it. How ai-bookkeeper now splits it."
tags: [ebay, bookkeeping, ecommerce, open-source]
---

# Bookkeeping an eBay payout: what the Transaction report already knows

An eBay seller sees one deposit, say $111.70, and has to explain it to a
bookkeeper: sales, shipping labels, a refund, fees. The Seller Hub
**Transaction report** has every row, and each row carries the Payout ID it was
paid in. That makes the split mechanical.

`ai-bookkeeper` now reads that report (`payouts` command, same as Stripe,
Square, PayPal, Etsy and Amazon):

- rows group by Payout ID; the fee on an order is gross less net;
- shipping labels and other fees are fees with no sales behind them;
- holds and releases go to a reserve account, not income;
- seller-collected sales tax comes out of sales only when item subtotal +
  shipping + tax equals the gross exactly, otherwise it is left alone;
- the report's own Payout row must equal the sum of its rows, or that payout is
  not split and is listed as a problem.

The result is posted as a split against the matching bank line: sales, refunds
and fees each in their own account, so gross sales and the real cost of selling
on eBay show in the P&L.

**Honest limits.** The layout is written from memory of eBay's help pages and
tested on one hand-made fixture. No real export has been tried, and the repo's
roadmap lists that as the next step. If your report has a column this misses,
the reader says which one instead of guessing. Not accounting advice.

Code and tests: `ventures/ai-bookkeeper/payouts.mjs`, `payouts.test.mjs`.
