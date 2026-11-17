---
title: "A wall height nobody checked. Red-teaming the HVAC load and duct calculator"
seo_title: "Mutation testing an HVAC load calculator: untested bounds"
date: 2026-11-15
tags: [testing, mutation-testing, hvac, javascript, redteam]
description: "16 faults seeded into the HVAC load and duct calculator, 9 caught. A hand search found an unchecked wall height that gave a NaN heating load. Now fixed."
---

Today's red-team run aimed at
[the HVAC load calculator](https://marisstella.app/hvac-load-calc/), which
works out a house's room-by-room heating and cooling loads and then sizes the
duct runs and trunks from that airflow. It launched on 2026-11-11 and changed
again this week, so it was a fair target. `redteam.py campaign` seeded 8 faults
into `load.mjs` (the load engine) and 8 into `duct.mjs` (the duct sizer). For
each one it applied the fault, ran the suite and restored the file.

The load engine's suite caught 7 of 8. The duct sizer's caught 2 of 8.

## What got through

Every fault that got through moved a limit by one: a bound in the input
checks, or the point where a warning starts.

| Fault | Where | Why the tests missed it |
|---|---|---|
| Component losses allowed up to 3 in. w.c. instead of 2 | `duct.mjs` validator | no test at the bound |
| Duct roughness allowed from 1 instead of 0 | `duct.mjs` validator | no test at the bound |
| Rectangular trunk height from 5 in. instead of 4 | `duct.mjs` validator | no test at the bound |
| Effective length allowed up to 2,001 ft | `duct.mjs` validator | no test at the bound |
| "Friction rate is high" warning at exactly 0.18 instead of above it | `duct.mjs` warnings | no test at exactly 0.18 |
| "This room needs very little air" warning at 15 cfm instead of under it | `duct.mjs` warnings | no test at 15 cfm |
| Interior shade factor allowed up to 2 instead of 1 | `load.mjs` validator | no test at the bound |

The existing tests checked that each input was refused in one obvious case. A
limit that has moved still refuses the obvious case. A bound only gets tested
if something tries the exact value at each edge and a value just past it.

Writing one test per fault would have meant seven tests and nothing for the
next bound someone adds. The fix is one table per validator instead: every
bounded duct setting and every bounded envelope setting, each tried at its
minimum, at its maximum, and a millionth of its range outside each end. A new
bound goes in as one more row. Two more tests pin the warning thresholds at
exactly 0.18 in. w.c. per 100 ft and exactly 15 cfm. After the change,
`redteam.py rerun` re-applied all 7 escaped faults and the suite caught every
one. The catch rate went from 9 of 16 to 16 of 16.

## What the hand search found

The run also tried odd inputs by hand, the kind a stranger might type or
paste. Two were real bugs:

- **A wall's height was never checked.** A wall can override its room's
  ceiling height with `heightFt`, but the validator never looked at it. On the
  example house, `"heightFt": "abc"` gave a heating load of `NaN` with no
  error. `1e6` gave 89 million Btu/h instead of 26,901. `0` quietly dropped the
  wall. Only a negative height was refused, and then only through the
  "windows exceed the wall" check, with a confusing message. A wall height
  must now be a number from 1 to 40 ft, the same top as a ceiling.
- **Round duct sizes could be strings.** The size-list check was
  `s >= 2 && s <= 60`, and JavaScript coerces `"6"` and `[6]` into numbers for
  that comparison, so both passed. A string size then reached the report as
  `"8"`. Sizes must now be numbers.

Each fix started as a failing test.

## What this says about the repository

A catch rate of 56% before the fix is close to recent runs. Most of the faults
that get through are like these: a limit off by one, not a broken formula. The
formulas usually have a hand-worked check in the suite. The limits usually
don't. A table over the whole validator costs about as much as one test and
covers every limit.

Estimates only. The calculator is not an ACCA Manual J or Manual D design.
