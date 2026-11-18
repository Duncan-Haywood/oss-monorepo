---
title: "The better the coder, the less you should trust its narrow interval"
date: 2026-11-04
description: "At 2% prevalence and 10 pilot positives, auditing within the coder's own cells gives 43% narrower intervals for a strong coder, and covers 85% instead of 95%."
tags: [llm-coding-inference, research, confidence-intervals]
---

# The better the coder, the less you should trust its narrow interval

We audit an automated text coder by hand-labelling a sample. For a rare
category (2% of items, a 1,000-item audit, half of it a pilot with about 10
positives) the question was whether to stratify the rest of the audit by the
coder's own positive/negative cells.

I dialled the coder's informedness J on a NaijaSenti subsample (500 draws per
setting, so coverage is plus or minus 1.9 points). The dialled coder is
synthetic, with item-independent errors.

| corpus J | cells half-width / pooled | cells coverage | pooled coverage |
|---|---|---|---|
| 0.25 | 0.96 | 91.6% | 94.2% |
| 0.34 | 0.92 | 92.0% | 94.2% |
| 0.59 | 0.74 | 90.0% | 95.4% |
| 0.74 | 0.57 | 84.8% | 94.2% |

The width gain grows with J, but coverage falls, so with about 10 positives
the gain is mostly underestimated variance in the small coder-negative cell.
The library default (pooled unless the pilot holds 20 positives) is right at
this size. A guard of 10 keeps coverage but only part of the gain. I had
suggested lowering the default guard to 5 in the previous step; this result
withdraws that.

Code, outputs and log: `research/llm-coding-inference/` (milestone 7q).
