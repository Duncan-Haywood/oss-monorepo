---
title: "The floor was free: proving two staff schedules in 1.7 seconds instead of 19"
seo_title: "Faster optimality proofs for a staff schedule with a cheap LP floor"
date: 2026-11-12
tags: [shift-roster-builder, product, optimisation, measurement]
description: "A staff scheduler took 19 s to prove two call-out weeks. Most of it went on finding a 3-hour floor that a 0.05 s LP plus whole-shift rounding gives."
---

The [shift roster builder](https://marisstella.app/shift-roster-builder/) builds a week's staff schedule. Then it checks that schedule against an exact search, so the page can say no roster under the same rules does better. Earlier today [one extra LP row](2026-11-12-shift-roster-three-eighths-of-a-shift.md) closed the last two call-out weeks still left "bounded". In both, a spare part-timer was on the team and Cleo, or Eli, was off on Saturday. The proof held, but each week took about 19 seconds. A manager rebuilding the week after a sick call waits that long.

## Where the 19 seconds went

That row says "at least 3 hours stay open". It needs a floor on open hours, and the floor came from the end of a long chain:

1. The pay LP ran without the row for its full 8-second budget and could not close the gap.
2. The exact search then priced shifts, branched on those prices and ran a branch-and-price on open hours: about 10 more seconds.
3. That gave a 2-hour floor. Rounding up to whole shifts made it 3, and only then did the pay LP get the row. With it, the proof took 0.1 seconds.

So almost all of the time went on finding the number 3.

## The cheap way to get 3

There is a much smaller LP: open hours only, no pay. Its root solve takes under 0.05 seconds on these weeks and answers 1.5 hours. On its own that is weaker than the 2 hours the exact search found. But the café's shifts are 3, 8 and 10 hours long. A roster either holds a shift or leaves the whole of it open, so open hours are always a sum of shift lengths, and no such sum lies between 0 and 3. Any floor above zero, 1.5 included, therefore lifts to 3.

The builder now does that first. It solves the open-hours LP's root, lifts the result to the next sum of shift lengths, and hands that to the very first pay LP as its row. The row goes in only when the lift raises the floor above the LP's own value; otherwise nothing changes.

## What it did

Every call-out rebuild from both studies, plus the posted weeks and the four built-in templates, 65 weeks in all, built with the change off and on:

| weeks | time, off -> on | result |
|---|---|---|
| Cleo off Saturday, spare part-timer | 19.4 s -> 1.7 s | same score, 3 h open, proven |
| Eli off Saturday, spare part-timer | 19.1 s -> 1.7 s | same score, 3 h open, proven |
| the other 63 | within run-to-run noise | same rosters |
| all 65 | 88.7 s -> 54.5 s | 65 of 65 proven both ways |

## Where it doesn't help

The flagship's to-do list also asked for a floor on big weeks, above 60 shift copies. There the exact search is skipped, so nothing supplies one, and this LP looked like a candidate. It isn't. On all eight 30- to 60-person bench weeks its root came out in whole hours (181, 142, 189 h and so on), so the lift had nothing to add, and the solve cost 0.3 to 2.2 seconds. Those weeks use shifts of 4 to 9 hours, so almost every whole number of hours is a reachable sum. On the hardest 60-person week the LP reached only 212 hours, against the pay LP's 275 and the 300 the roster holds. So the step is off by default above 60 copies, and the open gap on big weeks needs a stronger idea.

Not claimed: one cloud machine, seeded and sample weeks only, and only two weeks changed. The measurements are in `ventures/shift-roster-builder/eval/early-floor.out.txt`, and the README section "The open-hours row from the first pass" has the details.
