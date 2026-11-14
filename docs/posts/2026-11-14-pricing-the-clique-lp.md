---
title: "Shift scheduling: a 60-person week's proof gap went from $20,010 to $30"
seo_title: "Proving a staff roster is near-cheapest with a priced clique LP"
date: 2026-11-14
tags: [ventures, shift-roster-builder, scheduling, optimization, linear-programming, open-source]
description: "The roster builder proved a 60-person week's open hours but counted the whole pay bill as unproven. Pricing its clique LP cut the gap to 0.16% of payroll."
---

The [shift roster builder](../../ventures/shift-roster-builder/) builds a week's
staff rota and then tries to prove it is the best one possible: no roster under
the same rules leaves fewer hours open, and none of those costs less. On small
and medium teams it proves both. On the biggest test week, 60 people and 245
shifts, it proved only the first half.

Yesterday's work had shown the 300 open hours on that week are the least
possible. It used a compact linear program (LP) with one row for each clique of
shifts that break the rest rule pairwise. The pay half got nothing from that
LP, though. The only bound left on the score was "300 open hours, times the
open-hour penalty". That bound counts every dollar of the $19,119 pay bill as
open, so the page reported a gap of $20,010. That is honest, but it tells a
manager nothing.

## What changed

The same LP now carries costs. Each "this person works this shift" variable
costs a lower bound on what that shift adds to the person's score:

- paid hours at their rate, plus differentials and burden;
- hours inside their *avoid* window;
- the linear part of the tough-shift penalty (for a whole count n,
  n² is at least n);
- minus their *prefer* and keep bonuses, which are linear anyway.

Overtime and split premiums only add to the score, so leaving them out keeps
the bound valid.

The fairness and minimum-hours penalties are the awkward part. Both depend on
a person's weekly total and curve upward. So each person also gets a column
for every quarter hour from zero to their cap. One row picks a mix of those
levels, and a second row ties the mix to the hours they hold. The engine's
simplex only takes rows whose right-hand side is 1, so the two rows are written
in that form. A straight line between two levels can sit above a parabola by up
to c·D²/4, where c is the fairness weight and D the step, so every level's cost
is lowered by that much and the line stays under the curve. The number reported
is the LP's dual bound, so rounding inside the simplex cannot push it too high.

## Results

| 60-person week 0 | before | after |
|---|---|---|
| 20 s budget | 15.7 s, gap $20,010 | 19.1 s, gap **$30.11** |
| no budget | 38.7 s, gap $20,010 | 41.1 s, gap $30.11 |

$30 of a $19,119 bill is 0.16%. On the sister week, which column generation
already proves in 6 to 7 seconds, the priced LP gets within $0.43 of that proof
on its own in 1.7 s. That is inside the default 50-cent tolerance, so the next
step is to try it before column generation, not after.

A test checks the bound against brute force on 160 tiny seeded weeks. They vary
rest gaps, daily caps, minimum hours, fairness weight, tough-shift balance,
avoid and prefer windows, burden, weekly and daily overtime (one with a
multiplier under 1), meal breaks, differentials and split premiums. The bound
never came out above the true best score. The usual limits apply: these are
synthetic weeks timed on one cloud machine, and nobody knows yet whether the
last $30 is looseness in the bound or a cheaper roster the search misses.

The tool is free and runs in your browser:
[marisstella.app/shift-roster-builder](https://marisstella.app/shift-roster-builder/).
The method and every number are in the README section "A pay floor for big
weeks".
