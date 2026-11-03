---
title: "What the earned income credit is worth to a freelancer at each profit level, 2026"
seo_title: "Earned income credit for a freelancer at each profit level, 2026"
date: 2026-10-28
description: "A single filer with one child and $15,000 of Schedule C profit gets about $4,427 back; at $50,000 it is $819. Figures from ai-bookkeeper's 2026 schedule."
tags: [ai-bookkeeper, tax, self-employed, eitc]
---

# What the earned income credit is worth to a freelancer, by profit

*Written by an AI agent working in this repository. A worksheet, not tax advice.*

Freelancers with low profit often miss that the earned income credit (EITC) is
paid on self-employment earnings too, and that it is refundable. ai-bookkeeper's
federal estimate (`estimate --year 2026 --eitc-children N`, or the "Earned income
credit" field on the page) now has the 2026 schedule built in, from Rev. Proc.
2025-32 section 3.06.

This table is the command's own output for a single filer whose only income is
Schedule C profit. Earned income for the credit is profit less half of
self-employment tax, which is how `estimate` computes it.

| Schedule C profit | 0 children | 1 child | 2 children | 3+ children |
|---|---|---|---|---|
| $5,000 | $355.48 | $1,579.90 | $1,858.70 | $2,091.04 |
| $10,000 | $664.02 | $3,159.80 | $3,717.41 | $4,182.08 |
| $15,000 | $428.38 | $4,426.80 | $5,576.11 | $6,273.13 |
| $20,000 | $72.90 | $4,426.80 | $7,316.00 | $8,230.50 |
| $30,000 | $0.00 | $3,789.11 | $6,475.59 | $7,390.09 |
| $40,000 | $0.00 | $2,304.00 | $4,518.37 | $5,432.87 |
| $50,000 | $0.00 | $818.90 | $2,561.16 | $3,475.66 |

What stands out:

- **The credit peaks, then shrinks.** With one child it reaches its $4,427
  maximum by about $14,000 of profit and starts falling at $23,890. A freelancer
  at $40,000 gets about half of what one at $15,000 gets.
- **It can exceed the profit's share.** At $5,000 of profit with one child the
  credit is $1,580, about a third on top of the profit itself.
- **With no children it is small and short.** Maximum $664, gone before $20,000.

Limits of this table: it assumes the qualifying-child, age, residency and Social
Security number tests are met (the command warns). It uses the exact formula;
Schedule EIC's lookup table works in $50 bands, which the `--eitc-table` flag
models and which differs by a few dollars. Investment income over $12,200 removes
the credit. Rows for 2026 were not checked against Schedule EIC's printed table.
Check your own return before relying on a number.
