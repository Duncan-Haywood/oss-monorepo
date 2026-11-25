---
title: "Quality fix: the workers' comp charges your premium discount skips"
seo_title: "Workers' comp terrorism and catastrophe charges, outside the discount"
date: 2026-11-25
tags: [quality-audit, workers-comp-premium-calculator, for-customers, construction, insurance]
description: "The free workers' comp calculator now prices terrorism and catastrophe per $100 of payroll, outside the mod and premium discount."
---

A contractor's workers' compensation quote has two kinds of line. Most of the
premium is rated: payroll divided by 100 times the class rate, multiplied by
the experience mod, adjusted by a schedule credit or debit, then reduced by
the premium discount. A few lines are not rated at all. In NCCI states the
terrorism and catastrophe charges are a rate per $100 of payroll, usually a
cent or two, added after the discount and never multiplied by the mod or the
schedule debit.

Until today the
[Workers' Comp Premium Calculator](../../ventures/workers-comp-premium-calculator/)
had one box for "surcharges", a percentage of premium after the discount. A
contractor who typed the terrorism charge there had it scaled by their mod and
schedule debit. On a roofing quote with a 1.12 mod and a 5% debit that
overstates a $46.67 charge by about 18%: small in dollars, but the line no
longer ties to the declarations page, and a reconciliation worksheet that does
not tie is one nobody trusts.

The [quality audit of 2026-11-09](../../portfolio/quality/audits/2026-11-09-workers-comp-premium-calculator.json)
found this and five other gaps. The arithmetic itself was right to the cent;
the gaps were in what the tests would catch.

## What changed

- **Terrorism and catastrophe have their own field**, in dollars per $100 of
  payroll. They are charged on the premium basis (payroll after the overtime
  exclusion) and added after the discount, outside the mod and the schedule
  rating. The worked example now carries $0.02 per $100: 233,333.33 of basis
  gives $46.67, and the total moves from $42,476.24 to $42,522.91, which a
  browser run of the page printed to the cent.
- **The tests pin which amount the discount is taken on.** The audit moved the
  discount from the scheduled premium to the pre-schedule premium and all ten
  tests stayed green. A new hand-counted case (12,000 modified, 13,200 after a
  10% debit, 5% discount = 660, not 600) now fails on that change.
- **Every validation limit is tested at its edge**: schedule rating at ±25
  passes and ±25.5 throws, discount 30 passes and 30.5 throws, mod 0.3 and 3
  pass and 0.29 throws. The findings thresholds are tested on both sides too
  (a class at exactly 60% of manual premium is flagged, 59.9% is not; flat
  charges at exactly 15% are not flagged, 15.1% are).
- **A zero mod step is refused** instead of being silently replaced by 1.
- **The README's test command works**: `node --test '*.test.mjs'` from the
  tool's folder, the form Node 22 accepts.

Four of the audit's five seeded mutants had survived. Re-run with the
repository's mutation helper after the change, all four, and a fifth that
applies the mod to the terrorism charge, now fail a test. 32 tests pass.

## What is still not at the bar

The premium discount is still a percentage you type in. Carriers compute it
from a size table that differs by state and between stock and mutual
carriers, and shipping a table we cannot keep current would make the tool
wrong in a way the user cannot see. The field now says to copy the line from
your quote. A later quality round re-audits the tool; this one does not raise
its score.

The calculator is free and runs in your browser. It does the arithmetic on
rates you type in; it is not an insurance quote or advice, and your carrier's
figures control.
