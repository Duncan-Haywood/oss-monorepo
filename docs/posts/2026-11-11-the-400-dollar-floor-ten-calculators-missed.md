---
title: "The $400 floor: ten of our tax calculators charged self-employment tax on tiny profits"
seo_title: "No self-employment tax under $400: a bug we found in ten calculators"
date: 2026-11-11
tags: [red-team, self-employment-tax, schedule-se, testing, calculators]
description: "A red-team run on the owner-operator per diem calculator found that ten of our tools charged 15.3% SE tax on profits under $433, or checked the $400 floor against the wrong number."
---

Schedule SE has a floor. Multiply net profit by 92.35% to get net earnings
from self-employment. If that figure is under $400, you owe no
self-employment tax. A $430 profit is $397.11 of net earnings, so it owes
nothing.

Today's red-team run started on the
[owner-operator per diem calculator](../../ventures/owner-operator-per-diem-calculator/index.html).
Its `seTax` function charged 15.3% on any profit above zero. The effect is
small but real. A driver whose per diem deduction takes profit from $6,500
down to $100 was told $14.13 of SE tax was still due on the $100. The
correct figure is zero. So the page understated what the deduction saves.

## The same formula, copied

Every SE-tax function in the catalogue uses the factor `0.9235`, so a
search for that number finds the class. It turned up 23 files. Nine more
of them had the same bug in one of two forms:

- **No floor at all:** booth-rent-vs-commission, the SEP-IRA contribution
  calculator, the Solo 401(k) contribution calculator, the SEP-IRA vs Solo
  401(k) comparison, contract-vs-FTE, clergy housing allowance, and
  locum tenens vs employed.
- **The floor checked against profit instead of net earnings:** the
  self-employed health insurance calculator and the babysitting business
  kit. With `profit < 400`, a $420 profit ($387.87 of net earnings) was
  still taxed $59.34.

In the retirement calculators the bug ran one step further. Contributions
come from profit minus half the SE tax, so a tax that should not exist
also shrank the contribution base. One existing test had locked in the
wrong answer. It asserted that a $1 profit gives *less* than $1 of
earnings to contribute from. That test now expects exactly $1.

The remaining five files that use `0.9235` apply it as a marginal rate to
a deduction (mileage, home office, Augusta rule) or as a per-week or
per-game rate (nail tech booth rent, sports official fees). The annual
floor does not apply to those, and each is listed with its reason.

## What runs now

Each of the ten files got a test that fails on the old code (433 x 0.9235
= $399.88 owes nothing; 434 x 0.9235 = $400.80 owes the full rate) and a
fix. A new lint, `platform/ci/check_se_tax_floor.py`, fails on any venture
script that uses the 92.35% factor without comparing something to the
floor, unless the file is on the exemption list. Run against the old tree,
it flags 8 of the 10 broken files. The two that compared profit to $400
pass it, because a text lint cannot tell profit from net earnings; their
own tests now catch that form.

The seeded-fault side of the run: 8 mutants went into the per diem
calculator, and its tests caught 6. The two that escaped were boundary
holes: other wages at or above the wage base, and a travel-day percentage
between 100 and 101. Two new tests close them, and a rerun catches all 8.

Each of these tools is an estimate, not tax advice. The floor rule here is
the general one; church employee income has its own lower threshold, which
none of these calculators model.
