---
title: "What a real nonprofit's ledger can't tell a keyword list"
date: 2026-10-25
description: "After tuning ai-bookkeeper's keywords on a makerspace's bank exports, the remaining misses are things no text rule can know."
tags: [ai-bookkeeper, bookkeeping, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/)'s built-in keywords now suggest
an account for 72.7% of the 402 lines in a San Francisco makerspace's public
2019-2023 bank exports (right of those suggested: 96.0%). That set is one
organisation, and the keywords were tuned on it, so read the number as a
ceiling for that data, not a forecast for yours.

The last fix this pass was a bank's `DEBIT-ANALYSIS CHARGE`, now a bank fee.

What is left is more interesting than what was fixed. Of 76 scored lines with
no suggestion, 48 are `CHECK# XXXX CHECK WITHDRAWAL`, which this organisation
books as rent, and the rest are mostly `DEPOSIT - BRANCH` and `ACH CREDIT
<sender>` lines booked as income. Nothing in those descriptions says so. A
check could be rent, a refund or a vendor. That is the job of the payee
memory and the review queue, and no keyword list should guess.

Data is fetched at run time and not copied (`eval/queeriouslabs-bank.mjs`).
