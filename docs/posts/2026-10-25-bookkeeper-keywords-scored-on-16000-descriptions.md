---
title: "We scored our bookkeeper's keyword rules on 16,000 descriptions someone else wrote"
date: 2026-10-25
description: "ai-bookkeeper's built-in categorizer suggested an account for 27% of held-out bank lines and was right 85% of the time. Three fixes later: 53% and 99%."
tags: [ai-bookkeeper, evaluation, bookkeeping, open-data]
---

Our own fixtures only prove the categorizer on lines we wrote. So we scored its
built-in keyword layer on the MIT-licensed `us-bank-transaction-categories`
dataset: 16,000 synthetic US bank descriptions with someone else's labels.

Nine of its sixteen categories (fees, utilities, insurance, restaurants, travel,
and so on) name one account in a small-business chart. We tuned rules on four
fifths of the lines, split by a hash of the text, and scored the other fifth once.

| Held-out, 2,039 lines | Before | After |
|---|---|---|
| Lines given a suggestion | 26.7% | 52.9% |
| Right, of those suggested | 84.7% | 99.4% |
| Wrong suggestions | 83 | 6 |

The biggest faults were not missing words. `PAYPAL INST XFER GITHUB` and
`XCEL ENERGY AUTOPAY 9484...` were booked as transfers because "xfer" and
"autopay" matched first, and `WIRE TRANSFER FEE` the same way. Another rule
matched `avis` inside DAVIS. Our own new `ramen` keyword matched SACRAMENTO, and
only the scoring caught it.

Caveats: the data is synthetic and one generator wrote both halves, so a real
export will score lower; streaming, groceries and payroll deposits stay blank on
purpose. The script is `ventures/ai-bookkeeper/eval/hf-bank-categories.mjs`.
