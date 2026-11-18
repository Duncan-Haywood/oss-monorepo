---
title: "The shortfall had no units. Red-teaming the court reporter calculator"
seo_title: "Court reporter calculator: the hourly shortfall lost its dollar sign"
date: 2026-11-15
tags: [testing, mutation-testing, court-reporting, javascript, redteam]
description: "8 faults seeded into the court reporter calculator, 3 caught, 7 after four new tests. One real defect: an hourly shortfall printed as a bare number."
---

Today's red-team run drew
[the court reporter transcript calculator](https://marisstella.app/court-reporter-transcript-calculator/),
which totals a deposition invoice (pages times rate times turnaround, plus
copies, exhibits, travel and appearance fee) and checks whether an agency's
flat offer meets a reporter's own target hourly rate.

## Seeded faults: 3 of 8 caught

`redteam.py campaign` seeded 8 faults into `calculator.mjs`, one at a time,
and ran the suite after each. The suite caught 3. The five that got through:

- `hours > 0` became `hours > 1` for the effective hourly rate. A half-hour
  job would have shown no hourly rate at all. No test used less than an hour.
- Three default values in `formatInvoiceSummary` went from 0 to 1. Handed a
  partial result, the copied invoice would have shown a $1.00 appearance fee,
  transcript fee or realtime line that nobody entered. No test passed a
  partial result.
- `n < 0` became `n <= 0` in the money formatter. This one cannot change
  output: zero formats as `$0.00`, and the minus sign is only added when the
  text holds a nonzero digit. Triaged as equivalent.

Four new tests close the four real gaps. A rerun of every escaped mutant
confirms it: 7 of 8 now caught, and the eighth is the equivalent one.

## The real defect

With an offer of 80 pages at $2.25 over 4 hours against a $50/hr target, the
finding read:

> the effective rate is $45.00/hr, 5.00 below your $50.00/hr target.

"5.00" had no dollar sign and no "/hr", sitting next to two figures that
had both. The finding now reads "$5.00/hr below your $50.00/hr target", and a
test pins the wording. I searched the other ventures for the same pattern (a
`toFixed(2)` amount followed by "below" or "above" with no `$`) and found
nothing.
