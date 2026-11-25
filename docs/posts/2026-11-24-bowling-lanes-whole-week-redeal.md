---
title: "Re-dealing a whole week at once: two bowling seasons one count closer to even lanes"
seo_title: "Whole-week re-deals: two bowling seasons closer to even lanes"
date: 2026-11-24
tags: [combinatorics, local-search, bowling, league-schedule-generator]
description: "An exact assignment per week moved 26 teams over 12 weeks and 28 over 13 from 4 to 3 counts off an even lane split. On longer seasons it lost to tabu."
---

The [League Schedule Generator](../../ventures/league-schedule-generator/)
bowling page puts each week's matches on lane pairs so that every team bowls
on every pair about equally often. Short seasons are the hard case. With 26
teams (13 pairs) over 12 weeks, every team should bowl on 12 different pairs
and never repeat one. Before today the best stored answer missed that by 4
counts, and a SAT solver had found none at 0 in 900 seconds.

## The move

The old search swaps the pairs of two matches in one week. The new one
(`eval/bowling-week-lns.c`) frees a whole week and puts all its matches back
at once, choosing the best way against what the other weeks already hold.
That choice is exact and cheap. Each team plays once a week, so the week's
share of the total is a sum over (match, pair) cells. Picking one pair per
match then becomes a 13 by 13 assignment problem, which the Hungarian method
solves in microseconds. Ties go at random so the walk can cross flat
ground, and after a long stall it forces a random swap.

## What it found

| teams x weeks | stored before | now |
|---|---|---|
| 26 x 12 | 4 | **3** |
| 28 x 13 | 4 | **3** |
| 24 x 11 | 3 | 3 |

Each new answer is checked by the page's own count. The page now builds
3 for both seasons on its two test seeds.

It is not a better search in general. Across all twelve seasons in the
near-miss table it lost to the old tabu search on every long one, for
example 22 against 16 on 28 teams over 28 weeks. On 22 teams over 10 weeks,
which SAT solves exactly, it stalls at 2. Results also depend on the seed:
the 28 x 13 answer came from one seed in four, and the other three stopped
at 5.

## Two ideas that found nothing

- **SAT repair.** Keep most weeks of the stored 26 x 38 answer (1 off), free
  16 or 22 of its 37 weeks, and ask the solver to finish them at 0. Neither
  run found an answer in 25 minutes.
- **Writing out what counting forces.** In these seasons every team must be
  short on exactly one pair, and every pair short on exactly two teams.
  Giving the solver those facts directly made a solved case slower, 54 s
  against 1.5 s. Guessing that the two teams short on a pair are the two
  teams of one unplayed match was impossible in every round tried.

Every run is in `eval/bowling-week-lns-2026-11-24.txt` in the venture.
