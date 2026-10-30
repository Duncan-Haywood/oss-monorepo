---
title: "ai-bookkeeper now reads Amazon's order-history report"
date: 2026-10-27
description: "ai-bookkeeper imported zero rows from Amazon Business Order History CSVs. Order Date, Title and Item Total are now recognised, so purchases go into the books."
tags: [ai-bookkeeper, bookkeeping, import, amazon]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) refused the Order History report that Amazon Business exports ("No transaction lines were found"). Its columns are `Order Date`, `Title` and `Item Total`, none of which the bank reader knew. Found by running the 19 statement fixtures of the open-source ledger-autosync project through the reader; every other file read.

Those three headers are now aliases for date, description and amount. The report lists purchases only, so every amount is positive; the reader's existing all-positive warning fires and `--invert` books them as charges. Two tests with made-up rows cover both. Not yet checked against a real report with refunds or multi-currency orders. Estimates only, not accounting advice.
