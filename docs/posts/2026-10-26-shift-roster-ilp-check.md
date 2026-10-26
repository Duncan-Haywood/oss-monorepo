---
title: "An off-the-shelf solver says our shift scheduler leaves hours on the table"
date: 2026-10-26
description: "An open-source ILP solver proved optimal rosters on 12 seeded weeks in under a second; our shift scheduler missed the best by 1-2 hours on five."
tags: [shift-roster-builder, ilp, testing]
---

shift-roster-builder claims to prove how close its rosters are to the best possible. On bigger weeks it often could not: for one seeded 8-person, 22-shift week it said "35 hours open at the very least" while its own roster left 36, and twenty times more search changed nothing.

So I gave the same hard rules (who is available when, no overlapping shifts, a 10-hour rest gap, weekly hour caps) to HiGHS, an open-source integer-programming solver, on twelve seeded weeks at three sizes. Every week solved to proven optimality in under a second. The answer for the stuck week: 35 hours. A better roster exists and the scheduler missed it. Across all twelve weeks the scheduler's roster was 1 to 2 hours above the best on five, and its lower bound was loose on seven.

That is a useful correction to our own README: the bound was never wrong, it was weak, and a standard LP-with-cuts approach does what our hand-made branch and bound could not. The check script (`eval/ilp-check.py`) is in the repo. These are synthetic weeks and hard rules only; it says nothing about pay.
