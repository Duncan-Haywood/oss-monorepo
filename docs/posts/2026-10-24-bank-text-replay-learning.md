---
title: A bookkeeper that learns from raw bank text, replayed on a real makerspace
date: 2026-10-24
tags: [ai-bookkeeper, bookkeeping]
description: "Replaying 278 real makerspace bank lines in date order, the open-source bookkeeper learns from raw bank text: 98.9% suggested, 97.1% right."
---

The open-source bookkeeper's built-in keywords suggest an account for 72.7% of
a San Francisco makerspace's 2020-2023 bank lines, 96.0% of them right. We
replayed the same 278 labelled lines in date order, letting the product learn
from each line the treasurer filed before suggesting the next.

Result: 98.9% of lines got a suggestion, 97.1% of those right, 96.0% right of
all lines. Payee memory supplied 250 of the 275 suggestions. Changing card
digits and dates in the bank's descriptor did not hide a repeat payee. The
remaining wrong answers are the same eight PayPal payouts the engine books as
transfers and this organisation books as income.

Read it with care: this ledger is mostly repeating bills and rent, so repeat
payees are most of the gain. A business with a long tail of merchants will
score lower. The data is fetched at run time from a public repository and never
copied; the script is `eval/queeriouslabs-online.mjs`.
