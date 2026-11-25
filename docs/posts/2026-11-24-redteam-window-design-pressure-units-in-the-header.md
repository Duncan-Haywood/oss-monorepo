---
title: "The garage door that became a header row: red team on a wind pressure calculator"
seo_title: "Window design pressure calculator: units, elevation typos, Kzt = 1"
date: 2026-11-24
tags: [redteam, testing, mutation-testing, window-design-pressure-calculator, asce-7, javascript, ventures]
description: "Red team on an ASCE 7-16 window design pressure calculator: 6 of 10 seeded bugs caught, three real defects fixed, one dropping an opening silently."
---

Today's red-team run aimed at the engine of the
[window and door design pressure calculator](https://marisstella.app/window-design-pressure-calculator/),
which takes a basic wind speed, a building and an opening schedule and gives
each window and door the ASCE 7-16 DP rating it needs. Its 34 tests run in a
tenth of a second, and a red-team run had already been through it the day
before. A second campaign went at `platform/ci/wait_for.py`, the helper that
sessions use to wait on long jobs.

## Seeded bugs

| File | Seeded | Caught | Gaps closed |
|---|---|---|---|
| `window-design-pressure-calculator/calc.mjs` | 10 | 6 | 4 |
| `platform/ci/wait_for.py` | 8 | 7 | 1 |

These were the four calculator mutants that got through:

- **Ground elevation `<= 0` changed to `<= 1`.** Ke at 1 ft is 0.99996, which
  prints as 1.000, so no test could see it. A direct `ke(1) < 1` assertion
  now does.
- **`Lh > 0` changed to `Lh >= 0`.** A hill with Lh = 0 gives H/Lh = infinity,
  gets capped to 0.5 and produces a topographic factor instead of an error.
- **The 15 ft minimum hill height for exposure C and D changed to 16 ft.** A
  15 ft hill is the boundary, and nothing tested it.
- **The corner zone width printed to two decimals instead of one.**

Each one now has a test that fails with the mutant and passes without it.
`redteam.py rerun` confirmed all five, counting the `wait_for.py` one.

## Real defects

Reading the parser and the findings code as an attacker turned up three
behaviours a user could hit. Each now has a failing-first test and a fix.

1. **An opening written with units disappeared.** The schedule parser skips a
   header row when it is the first content line and both its width and height
   are words. `"36in"` and `"84in"` aren't numbers and contain letters, so
   `Garage door, 192in, 84in, 2` on the first line was read as a header and
   dropped. There was no error. If the later lines were plain numbers, the
   page showed a full result with one opening missing, and that could easily
   be the one with the highest required DP. A header field now has to start
   with something other than a digit. A first line with units gets the usual
   "needs a width and a height in inches" message, and `Mark, Width (in),
   Height (in)` is still skipped.
2. **A typed elevation could be ignored.** `5,280` (Denver, with a thousands
   separator) failed the plain-decimal check and was treated as blank, so
   Ke = 1 and the factor table read "1.0 permitted". The error is
   conservative, since Ke = 1 gives the higher pressure, but the user typed a
   number and the page silently did something else. A non-blank elevation
   that isn't a number is now refused with a message.
3. **"Topography raises the pressure by 0%."** A building farther from the
   crest than mu x Lh has K2 = 0 and Kzt = 1. The page still showed this as a
   medium-severity finding with a 0% increase. It now says the building is
   beyond the feature's zone of influence and gives the distance.

The open list from earlier red-team runs still has 13 entries. All but one
are control-plane fixes that wait for the owner's approval in their own PRs.
The other, the help-keeper stemmer, needs a help-center evaluation set before
it can be judged.
