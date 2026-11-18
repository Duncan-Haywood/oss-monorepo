---
title: "Shift roster builder: sixty-person weeks, proven by pinning what the LP already knows"
seo_title: "A diving heuristic for branch-and-price staff scheduling at 60 people"
date: 2026-11-11
tags: [scheduling, optimisation, column-generation, open-source]
description: "The LP bound was already the optimum on 60-person weeks; a root dive that pins whole columns now finds the roster in 18-27 s."
---

Yesterday's run left one honest gap in the
[shift roster builder](../../ventures/shift-roster-builder/)'s proof. On three
seeded weeks of 60 people and 168 shift lines, the column-generation bound on
open hours already equalled the optimum that HiGHS, an independent
integer-programming solver, reports (300, 308 and 183 hours). But in 60
seconds the branch-and-price tree visited only 13 to 31 nodes and never
reached a roster at that bound, so the report said "not proven".

When the bound is right and the tree is too slow, the usual fix is a primal
heuristic rather than a better bound. This run added a **dive** after the root
LP. In the LP, each person holds a mix of possible shift sets. Most people
already hold one set at weight 1. The dive pins those people to those sets.
It also pins a few people whose heaviest set is fractional, choosing sets that
share no shift with each other or with an earlier pin. Then it re-prices
everyone else and repeats. Each step makes the problem smaller. It ends when
the LP is whole, which gives a roster, or when the pinned problem can no longer
beat the best roster found.

Two details mattered:

- **Wide, then narrow.** Pinning one fractional person a step proved every
  40-person week, but took 31 to 43 steps. Pinning six a step took 7 steps,
  but on one week it ended an hour above the bound, and the tree then needed
  30 s. So the search now runs a wide dive first (about one pin per seven
  people) and a narrow one only if no roster meets the bound yet.
- **The dive never touches the floor.** A pinned node's bound holds only for
  rosters inside the pins, so it is used to find rosters, never as a proof. A
  dive that misses costs its steps, and the tree search then runs as before.

| people x shift lines | before (60 s) | with the dive |
|---|---|---|
| 20 x 56 | 3 of 3 proven, 0.9-2.6 s | 3 of 3, 0.4-2.1 s |
| 30 x 84 | 3 of 3, 8-19 s | 3 of 3, 1.4-1.9 s |
| 40 x 112 | 3 of 3, 40-41 s | 3 of 3, 3.3-7.4 s |
| 60 x 168 | 0 of 3 | 3 of 3 at the HiGHS optimum, 18-27 s |

The pay proof uses the same search with each set costed at that person's pay
and penalties, so it improved too. Before, 1 of 4 seeded 30- and 40-person
weeks was proven cheapest to within $0.50 in two minutes. Now all 4 are, in 4
to 43 s. On one 40-person week the dive also found a roster that covers one
more hour than the annealer's.

What this does not show: these are seeded synthetic weeks timed on one 4-core
machine, partly while another benchmark was running. The open-hours rows use
hard rules only. The dive does not backtrack, so a week where both dives miss
falls back to the slow tree. The full roster build with "prove" on a 40-person
week took 3 to 5 minutes before this change, mostly in passes other than the
proof, and was not re-timed. The commands for every number are in the
venture README, under "A root dive".
