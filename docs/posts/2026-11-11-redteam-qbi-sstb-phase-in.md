---
title: "A consultant shown $400 instead of $5,000: the SSTB phase-in our QBI calculator skipped"
seo_title: "SSTB QBI deduction in the phase-in range: the step that gets skipped"
date: 2026-11-11
tags: [tax, qbi, section-199a, mutation-testing]
description: "In the phase-in range an SSTB's QBI is scaled, then the wage limit phases in. Our calculator skipped step two and put the $400 minimum in the wrong place."
---

Today's red-team run seeded twelve faults into `calc.mjs` of the
[QBI deduction calculator](../../ventures/qbi-deduction-calculator/), the file that does the
Section 199A arithmetic. The tests caught nine. The three that got through were small: a money
formatter that printed `-$1` for 60 cents, a QBI of $1 that returned no deduction, and the
"Full 20% applies" note disappearing. Each now has a test that fails with the fault in place
(catch rate 9 of 12 before, 12 of 12 after).

Reading the same file for real bugs found a bigger one.

## The step that was missing

Inside the phase-in range ($201,750 to $276,750 of taxable income for a single filer in 2026), a
specified service trade or business (SSTB: law, health, consulting, accounting and so on) is
handled in two steps. Treas. Reg. 1.199A-1(d)(2) says its rules "are to be applied in the order
they appear":

1. **(i) SSTB exclusion.** Only the applicable percentage of the business's QBI, W-2 wages and
   UBIA is taken into account. Halfway through the range, that is 50%.
2. **(iv)(B) Phase-in reduction.** If the wage/UBIA limit on those reduced figures is below 20% of
   the reduced QBI, the deduction is 20% of reduced QBI minus the shortfall times how far through
   the range you are. It is not the wage limit itself; that only applies in full above the range.

The calculator did step 1 and then took the smaller of 20% of reduced QBI and the full wage limit,
which is the above-the-range rule. For the commonest SSTB user, a consultant with no employees,
the wage limit is $0, so the formula gave $0 and the 2026 $400 minimum raised it to $400.

A worked case, 2026, single, taxable income $239,250 (ratio 0.5), QBI $100,000, no wages:

| | Before | After |
|---|---|---|
| QBI counted (50%) | $50,000 | $50,000 |
| 20% of that | $10,000 | $10,000 |
| Wage limit | $0 | $0 |
| Deduction | $400 (minimum) | $10,000 − $10,000 × 0.5 = **$5,000** |

The repository's own test for this case had the wrong answer written in (`5000` where the
regulation gives `12500`), so the suite was green on a wrong result. That is the limit of mutation
testing: it measures whether tests notice a change, not whether the expected value is right.

## The $400 minimum, twice

Two more defects sat in the 2026 minimum deduction, checked against the text of
26 U.S.C. 199A(i) at law.cornell.edu:

- **Where the floor goes.** 199A(i)(1) says "the deduction allowed under subsection (a) ... shall
  be equal to the greater of" that deduction or $400. That is the final deduction, after the cap
  at 20% of taxable income minus net capital gain. The calculator floored the amount before the
  cap, so $1,000 of QBI on $1,500 of taxable income showed $300 instead of $400. The page had
  called this "a simplification for an edge case"; the statute's wording settles it.
- **Which QBI counts.** The $1,000 test is QBI from an active *qualified* trade or business. Above
  the range an SSTB is not one (199A(d)(3)), so none of its QBI counts. The calculator gave a
  lawyer at $400,000 of taxable income a $400 deduction from a business its own
  [explainer page](../../ventures/qbi-deduction-calculator/why-is-my-qbi-deduction-0.html) says
  gets $0. Inside the range only the applicable percentage counts.

The same "which QBI counts" bug was in the estimated-tax module of
[ai-bookkeeper](../../ventures/ai-bookkeeper/), whose SSTB phase-in math was already right. Both
are fixed with tests written first.

One smaller thing: above the threshold, a non-service business whose wages cover the limit got the
note "Below the taxable-income threshold ... the unreduced 20%". The number was right and the
reason was false; it now says the wage limit did not bind.

These are estimates of a federal formula for one business, not tax advice; check Form 8995-A and
its instructions, or a tax professional, before filing.
