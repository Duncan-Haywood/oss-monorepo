---
title: "A corner zone Infinity feet wide: red-teaming a new window DP calculator"
seo_title: "Window DP rating calculator: testing the 10 degree low-slope boundary"
date: 2026-11-23
tags: [redteam, testing, mutation-testing, window-design-pressure-calculator, asce-7, javascript, ventures]
description: "Red team on the new window DP calculator: 7 of 10 seeded bugs caught, 3 gaps closed, and typing Infinity made every window a corner window."
---

The [window and door design pressure calculator](https://marisstella.app/window-design-pressure-calculator/)
landed on `main` this morning. It takes a wind speed and an opening schedule
and works out the DP rating each window, door and garage door needs under
ASCE 7-16 Chapters 26 and 30. Today's red-team run aimed at its engine,
`calc.mjs`, because new code that people will order windows from is where an
unnoticed bug costs the most.

## Seeded bugs: 7 of 10 caught

`prompts/redteam.py` made ten one-token changes to `calc.mjs`, one at a time,
and ran the venture's tests after each. The suite caught seven. The three it
missed were all boundaries:

- **The 300 mph cap.** Changing `V > 300` to `V > 301` passed every test. No
  test typed a speed just over the cap.
- **"10 degrees or less."** Figure 30.3-1 note 5 cuts the wall coefficients
  by 10% when the roof slope is 10° or less. Changing `theta <= 10` to
  `theta < 10` also passed. You might think a slope of exactly 10° can't come
  from a pitch typed as rise per 12, but it can: a pitch of
  `2.1159237685015797` gives `theta === 10` in floating point. Unlikely to be
  typed, but reachable, so it's now tested.
- **A hill with the building at height 0.** The exported `kzt()` treated
  `z = 0` as valid once `z > 0` became `z >= 0`. Nothing on the page passes
  zero (the roof height is checked first), but the function is exported and
  tested on its own, so the test now pins it.

With one new test for the three, `rerun` re-applied each mutant and all three
now fail the suite. The catch rate on this file goes from 70% to 100%.

## A real defect: Infinity feet

Reading the input parsing as a stranger would, the number reader accepted
whatever JavaScript's `Number()` accepts. That includes `"Infinity"` and
anything that overflows, like `"1e400"`. Typing either as the building's
least dimension gave a corner zone width of a = Infinity ft. Every opening
then sat "inside" the corner zone and got the zone 5 suction, and the factor
table printed "Infinity". A width of `1e400` inches produced a row with an
area of Infinity ft².

Nobody types this by accident, but it is the kind of input a pasted
spreadsheet cell or a curious visitor produces, and the page should say
"enter a number" rather than show a confident wrong answer. The fix is one
line: the reader now treats a non-finite number as blank, so the existing
"Enter the building's least horizontal dimension" message appears. The test
went in first and failed on the old code.

Seven other ventures share the same number reader. A quick probe that
replaced each numeric field in their sample inputs with `"Infinity"` found no
result carrying Infinity or NaN; their own range checks already refuse it.

## Numbers

| | Before | After |
|---|---|---|
| Seeded bugs caught | 7 / 10 | 10 / 10 |
| Real defects found | 1 | 1 patched |
| Tests in the venture | 29 | 31 |

The run record, with each mutant and its triage, is
`prompts/runs/2026-11-23-session_01EhTJVPmYaL5JJaYmkckwHS.json`. The
calculator does arithmetic on the numbers you enter; it is not engineering
advice, and the building official or engineer of record sets the design
pressures.
