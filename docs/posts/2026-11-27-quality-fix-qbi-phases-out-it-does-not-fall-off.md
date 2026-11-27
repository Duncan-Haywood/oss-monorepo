---
title: "Quality fix: our freelancer tax set-aside dropped the QBI deduction off a cliff"
seo_title: "QBI deduction phase-out 2026: how it shrinks above $201,750"
date: 2026-11-27
tags: [quality-audit, us-freelancer-tax-set-aside-calculator, for-customers, freelancers, tax]
description: "Above $201,750 of taxable income our set-aside calculator took no QBI deduction at all. The 2026 law phases it out over $75,000. Fixed, with the hand check."
---

The 20% qualified business income (QBI) deduction is the biggest federal
break most sole proprietors get. The [US Freelancer Tax Set-Aside
Calculator](../../ventures/us-freelancer-tax-set-aside-calculator/) got it
wrong for higher earners. Once taxable income before the deduction passed
$201,750 (single or head of household) or $403,500 (joint), the tool took
no deduction at all. A freelancer $1 over the line lost the whole thing.

The law doesn't work that way. Under IRC 199A(b)(3) and (d)(3) the
deduction shrinks gradually over a range above the threshold. From 2026
that range is $75,000 wide for single and head-of-household filers and
$150,000 for joint filers. If your business pays no W-2 wages and owns no
equipment or property, which is true for most solo freelancers, the
deduction is:

> 20% x qualified business income x (1 - amount over the threshold / range)

and it reaches zero at $276,750 single or $553,500 joint. Without wages or
property, a service business (consulting, design, law, accounting) and any
other business phase out the same way.

## What the old figure cost

Take a single filer with $250,000 of net profit and no other income.
Working it by hand:

| step | amount |
|---|---|
| SE earnings (92.35%) | $230,875.00 |
| SE tax (22,878 + 6,695.38) and half of it | $29,573.38 / $14,786.69 |
| AGI | $235,213.31 |
| Taxable before QBI (less $16,100 standard deduction) | $219,113.31 |
| Over the threshold | $17,363.31 of $75,000 |
| QBI: 20% x 235,213.31 x (1 - 0.2315) | **$36,151.78** |

The old tool took $0 there, which put $10,063.49 more federal income tax
on the set-aside than the law asks (taxable income $219,113.31 against
$182,961.53; the deduction pulls most of it from the 32% bracket down to
24%). The tool now shows $36,151.78, and a test pins it.

## Also fixed in this pass

- New tests for Additional Medicare Tax when wages use part of the
  $200,000 threshold, for the "90% of this year's tax" estimated-payment
  target, and for the head-of-household bracket edges. Seeded bugs in each
  of those, and in the new phase-out, now fail a test. The audit found
  three of five seeded bugs survived.
- The FAQ said "most freelancers land between 25% and 35% of profit"
  with no source. It now gives the tool's own worked example instead:
  single, $100,000 profit, 5% state rate, $27,011.31 (27% of profit).
- Two smaller defects from the same audit (the 110% safe harbor and a
  stray QBI message at zero income) were already fixed by the
  [red-team pass](2026-11-20-redteam-the-110-percent-rule-reads-last-year.md);
  the [audit file](../../portfolio/quality/audits/2026-11-20-us-freelancer-tax-set-aside-calculator.json)
  now records them as fixed.

## What it still doesn't do

If your business pays W-2 wages or owns depreciable property, and is not a
specified service business, you can keep more of the deduction above the
threshold than this tool shows. It assumes neither. The 2026 $400 minimum
QBI deduction isn't modelled either. Both are listed on the page and in the
README. A later quality round re-audits the tool; this fix doesn't change
its scores.

Not tax advice. Check the figures on irs.gov or with a tax professional.
