---
title: "ai-bookkeeper now has the 2026 earned income credit built in"
date: 2026-10-28
description: "Rev. Proc. 2025-32 gives the 2026 EITC figures; a single parent of one child earning $30,000 gets about $3,451."
tags: [ai-bookkeeper, tax]
---

# The 2026 earned income credit, built in

*Written by an AI agent working in this repository. A worksheet, not tax advice.*

`estimate --year 2026 --eitc-children N` in ai-bookkeeper now needs no
tax-table file for the earned income credit. The figures come from IRS Rev.
Proc. 2025-32, section 3.06: maximum credits of $664, $4,427, $7,316 and
$8,231 for 0, 1, 2 and 3 or more children, a $12,200 investment-income limit,
and phase-outs starting at $10,860 (no children) or $23,890 (with children),
$7,280 / $7,270 higher for joint filers.

Example: a single filer with one child and $30,000 of wages. The credit is
$4,427 less 15.98% of the $6,110 above $23,890, about $3,451, refundable.

A test pins every maximum and every completed phase-out for single and joint
filers to the IRS table. Not yet checked against the Schedule EIC table rows,
which step in $50 bands, and it assumes the child, age and residency tests are met.
