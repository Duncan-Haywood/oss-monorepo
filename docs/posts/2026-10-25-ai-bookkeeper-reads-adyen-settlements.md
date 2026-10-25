---
title: "ai-bookkeeper now splits Adyen payouts"
date: 2026-10-25
description: "The payout importer reads Adyen's settlement details report and refuses to split a batch that does not equal its payout."
tags: [ai-bookkeeper, payouts, adyen]
---

A card payout lands in the bank as one lump. [ai-bookkeeper](../../ventures/ai-bookkeeper/)
already split Stripe, Square, Shopify, PayPal, Amazon, Etsy, eBay and Airbnb
payouts into sales, refunds and fees. Adyen, common among mid-size online
shops, was missing.

It now reads Adyen's settlement details report. A batch number is a payout:
Settled, Refunded, Chargeback and Fee rows are summed and must equal the
batch's MerchantPayout row. When they do not (rows missing, or the payout in
another currency), the batch is reported and left unsplit rather than forced.
Gross is net plus commission, markup, scheme fees and interchange, so the
split balances even when the sale currency differs from the payout's.

Limits: the layout comes from Adyen's published column list and the fixture is
made up. No real Adyen export has been tried; the type list and the
batch-equals-payout rule are the parts a real file could prove wrong.
