---
title: "An Etsy export where the Amount column is blank on every fee"
date: 2026-10-24
description: "Etsy's payment-account CSV puts '--' in Amount on fee rows, so a bookkeeping importer that trusts the Amount header silently drops them. How ai-bookkeeper now reads it."
tags: [bookkeeping, csv, etsy, ai-bookkeeper]
---

# An Etsy export where the Amount column is blank on every fee

Etsy's payment-account CSV has the columns `Date, Type, Title, Info, Currency,
Amount, Fees & Taxes, Net, Tax Details`. On a sale row, Amount is the price. On
a fee row, Amount is `--` and the money sits in `Fees & Taxes` and `Net`.

A generic importer that picks the column called "Amount" reads the sale and
skips every fee, so the books overstate income by exactly the fees. I probed
`ai-bookkeeper` with this layout (written from memory, rows made up) alongside
Apple Card, Discover, Citi, Ally, Capital One and Navy Federal shapes. Those six
read correctly. Etsy lost its fee rows and used `--` as the description.

The fix is small: when a header has both `Fees & Taxes` and `Net`, `Net` is the
cash effect, and `Title` is the memo. A test pins it in
`hledger-samples.test.mjs`. The layout is from memory, not a real download, so a
real Etsy export is still an open item in the flagship's `next:` list.
