---
title: "A carryforward for an election you can't make: red-teaming the bonus depreciation calculator"
seo_title: "Section 179 at 50% business use: no election, no carryforward"
date: 2026-11-23
tags: [redteam, testing, mutation-testing, bonus-depreciation-calculator, section-179, javascript, ventures]
description: "24 seeded bugs, 17 caught, 6 gaps closed. The real bug: at 50% business use the tool said Section 179 was unavailable, then showed a 179 carryforward."
---

Today's red-team run aimed at the engine of the
[bonus depreciation calculator](https://marisstella.app/bonus-depreciation-calculator/).
It compares three ways to write off an equipment purchase: 100% bonus
depreciation, a Section 179 election, and plain MACRS. Its suite runs in
about 0.1 s, so the run seeded two campaigns of twelve bugs each.

## Seeded bugs: 17 of 24 caught

| Campaign | Seeded | Caught | Equivalent | Gaps closed |
|---|---|---|---|---|
| seed default | 12 | 8 | 0 | 4 |
| seed 23 | 12 | 9 | 1 | 2 |

All six gaps now fail the suite (`redteam.py rerun`). What got through:

- **Defaults nobody leaned on.** Every test passed income and tax year
  explicitly, so changing the default income from $0 to $1, or the default
  year from 2025 to 2026, went unnoticed. An API caller who leaves a field
  out gets those defaults, so they are now pinned.
- **A 0% rate.** No test priced a deduction at a zero rate, so a clamp
  floor of 1% would have reported savings on a tax bill of nothing.
- **Advice on an empty form.** The "Section 179 lets you choose the amount"
  note could appear with no asset entered, and a `> 0` could become `> 1`.
  Nothing checked either.

The equivalent one changed the default recovery period from 5 to 6 years. A
6-year class doesn't exist, so the code falls back to 5 years and nothing a
user sees changes.

## The real bug: a carryforward for an election you can't make

Section 179 needs more than 50% business use in the year the asset goes into
service (IRS Pub. 946, ch. 2). The calculator knew that and said so:
*"Business use is at or below 50% -- Section 179 is not available."*

But it still ran the election. For a $100,000 asset at 40% business use with
$10,000 of taxable income, the same report went on to say:

> Section 179 elected amount exceeds this year's taxable income. $30,000 of
> the $40,000 elected cannot be used this year ... this carries forward as a
> SECTION 179 CARRYFORWARD.

You can't carry forward an election you weren't allowed to make. The
Section 179 column also showed "Elected: $40,000". The cash-saving figure
happened to be right, because the bonus remainder made up the difference,
but the carryforward and the elected amount were both wrong.

The fix is one line: below the threshold the election gets a basis of $0. The
column then elects nothing and shows bonus depreciation on the whole
business-use basis, which is what that path would really give. The finding now
says that instead of "ignore the Section 179 column". The test went in first
and failed before the fix.

## What's left

The 13 defects on the red team's open list are all control-plane changes
(workflows, `prompts/`, CI guards) that need their own owner-approved PR, plus
one search-stemming change that is waiting for a better evaluation set. None
of them could land in this run. This run didn't add a new automated guard: a
check that two findings in one report contradict each other doesn't
generalise across calculators the way a lint does.

*This calculator gives estimates, not tax advice. Check any election with a
qualified tax professional before filing.*
