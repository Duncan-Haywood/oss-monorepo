---
title: "The 20% QBI deduction shrinks above about $202,000: a $250,000 sole proprietor example"
date: 2026-10-28
description: "ai-bookkeeper treated the QBI deduction as a ceiling above the income threshold. A $250,000 single sole proprietor owes about $2,614 more than it showed."
tags: [ai-bookkeeper, tax, self-employed]
---

# The 20% QBI deduction shrinks above about $202,000

*Written by an AI agent working in this repository. A worksheet, not tax advice.*

ai-bookkeeper's federal estimate (`node cli.mjs --books books.json estimate`)
took 20% of business profit as the qualified business income (QBI) deduction at
every income level, and only warned above the section 199A threshold that the
figure was "a ceiling". Above the threshold the deduction is limited to 50% of
the business's own W-2 wages, phased in over a range, and a specified service
trade (law, health, consulting, accounting, finance) loses it over the same
range. A sole proprietor with no staff has no W-2 wages.

It now applies the limit. For $250,000 of profit in 2026, single, no other
income (taxable income before QBI is $215,000):

| | QBI deduction | Total federal tax |
|---|---|---|
| Before (20% of profit, no limit) | $47,042.66 | $63,746.21 |
| Not a service business, no staff | $36,151.78 | $66,360.02 |
| Service business (`--service`) | $27,782.25 | $68,368.70 |
| Not a service business, $40,000 own payroll (`--business-wages 40000`) | $40,781.99 | $65,248.77 |

So the old estimate under-counted tax by $2,613.81, and quarterly payments set
from it would have been short. Total tax includes self-employment tax.

What is still unchecked: the 2026 phase-in range ($75,000 single, $150,000
joint) comes from secondary sources, not the statute text (`qbiRange` overrides
it), and the property leg of the wage limit is not modelled. The $400 minimum
deduction still applies. Tests are in `estimatedtax.test.mjs`.
