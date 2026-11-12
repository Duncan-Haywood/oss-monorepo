---
title: "Three eighths of a shift: why a staff scheduler couldn't prove a roster it had already found"
seo_title: "Proving a staff schedule optimal: the open-hours row in column generation"
date: 2026-11-12
tags: [shift-roster-builder, product, optimisation, measurement]
description: "Two call-out weeks stayed 'bounded' because the pay bound's LP left part of an 8-hour shift open where a whole 3-hour lunch had to stay open. One extra row in the LP proves both."
---

The [shift roster builder](https://marisstella.app/shift-roster-builder/) builds a week's staff schedule and then checks it against an exact search. When that check finishes, the page says no roster under the same rules does better. When it doesn't, the page says "bounded" and shows how far off the best roster could be.

Earlier today two weeks were still stuck at "bounded". Both came from the call-out study, which rebuilds the sample café week once for each person calling out on each day. In both, a spare part-timer was on the team and Cleo, or Eli, was off on Saturday. The engine found a roster with 3 hours open and proved that no roster leaves fewer. It still couldn't prove the pay: the bound was $549 to $647 short after about 27 seconds.

## The LP knew the open hours, then forgot them

The pay bound comes from a linear programme solved by column generation. Each person picks one set of shifts, a shift is held or left open, and an open hour costs 100,000 so that coverage always beats pay. An LP may also take fractions. On these weeks it left 3/8 of an 8-hour shift open, 3 hours' worth, rather than leaving the whole 3-hour lunch open. That fractional answer is 1 hour cheaper on paper than any real roster can be, because the café's shifts are 3, 8 and 10 hours long and no real roster leaves less than 3 hours open. One open hour is 100,000 in the score, so the pay bound sat 100,000 below the roster and could never reach it.

The engine already knew the true floor. Earlier today we taught it that open hours come in whole shifts, which lifted the floor from 2 hours to 3. That floor just wasn't reaching this LP.

## One row

The fix adds one constraint to the LP: the hours left open must add up to at least the proven floor. That row holds for every real roster, so the bound stays valid. It touches only the "leave this shift open" columns, so the part that prices each person's best set of shifts doesn't change.

The LP solver had one built-in assumption: every coefficient was 0 or 1, and every right-hand side was 1. We generalised it to take any coefficient, and scaled the new row so its right-hand side is still 1. The first version returned a bound of 0. The new row started from an infeasible point, and the simplex, which assumes a feasible start, stopped at once. With every shift open the row is already satisfied, so the fix was to start its slack variable in the basis.

| week (spare part-timer) | before | with the row |
|---|---|---|
| Cleo off Saturday | 27 s, bounded, $647 short | 19.6 s, proven; the row's first LP lands on the roster's score in 0.15 s |
| Eli off Saturday | 27 s, bounded, $549 short | 19.6 s, proven |

So all 59 call-out rebuilds in the study are now proven, where 57 were this morning.

## Where it didn't fire

We reran the 6- to 15-person benchmark weeks and the four built-in templates. They gave the same rosters and the same scores as before. On those weeks the first pass of column generation already proves the roster, so the row never runs. On weeks above 60 shift copies the engine skips the exact search that proves the floor, so there is nothing yet to feed the row there. That's the next step, along with cutting the 8 seconds the first pass spends before the floor is known.

Before landing the change we checked it against brute force on 399 tiny three-person weeks. Using the true least open hours as the row, the bound never went above the best roster and never dropped below the bound without it.

## What this doesn't cover

Two weeks changed, and both come from one study of an invented café. Everything ran on one cloud machine. The figures and the tests are in the venture's README, under "The open-hours row in the score LP", and the code is MIT licensed.
