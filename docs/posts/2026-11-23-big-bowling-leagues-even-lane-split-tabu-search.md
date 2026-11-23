---
title: "Even lane pairs for big bowling leagues: a 24-team, 36-week season goes from 26 counts off to 4"
seo_title: "Even lane pairs for 22-28 team bowling leagues: 26 counts off to 4"
date: 2026-11-23
tags: [bowling, scheduling, optimization, league-schedule-generator]
description: "Big bowling leagues were where our lane rotation was least even and SAT gave no answer. A tabu search got 15 seasons much closer and put 2 at an even split."
---

The [League Schedule Generator](../../ventures/league-schedule-generator/)
has a free [bowling league page](https://marisstella.app/league-schedule-generator/bowling-league-schedule.html)
that rotates teams across lane pairs for a whole season. The goal is simple to
say: with P lane pairs and W weeks, every team should bowl on every pair
floor(W/P) or ceil(W/P) times. Over a 24-team, 36-week season that means
exactly 3 times on each of the 12 pairs.

The page meets that goal on most leagues up to 20 teams. A table of answers
found ahead of time by a SAT solver covers the hard season lengths. It
stopped at 22 to 28 teams, which are ordinary league sizes. On 25 of those
seasons the solver gave no answer within 420 seconds, or was never run. That
left the page well short of even. On 24 teams over 36 weeks it ended 26
counts outside the bound in total: some team bowled one pair twice and
another four times.

## What we tried

**A tabu search in C** (`eval/bowling-lane-tabu.c`). Each week's state is a
permutation: which lane pair each match bowls on. A move swaps the pairs of
two matches in the same week. That touches four teams and two pairs, so its
cost change takes constant time. The cost is the total out-of-bounds count.
A move is tabu for a few dozen iterations unless it beats the best so far.
When the search stalls, it shuffles a few weeks. It starts from the page's
own plan. We gave each season 120 seconds, then 300 more seconds from the
best answer so far, four seasons at a time on four cores.

**The CP-SAT count model**, hinted with the tabu answer. This model groups
the weeks that replay the same round-robin round, which removes most of the
week-order symmetry. It solved 22 teams over 34 weeks in 40 seconds. The
other seasons timed out at 90 seconds. It also re-proved that 28 teams over
14 weeks can never be even. That season is exactly as many weeks as there
are lane pairs, and the page already lists it as impossible.

## What changed on the page

Two seasons now have an even split: 28 teams over 12 weeks and 22 over 34.
Fifteen more get a stored starting plan that is closer than anything the
page's own search reaches. The page checks the plan again in your browser,
then polishes it, walks it and cuts back-to-back repeats as before.

| teams x weeks | before | now |
|---|---|---|
| 24 x 24 | 30 | 4 |
| 24 x 36 | 26 | 4 |
| 26 x 26 | 32 | 10 |
| 28 x 28 | 40 | 16 |
| 22 x 33 | 18 | 6 |
| 28 x 14 (even split proved impossible) | 44 | 32 |

Across the 17 seasons the total went from 251 counts off to 103, with the same
result on two different lane deals and 0.5 to 1.3 seconds per season.

## What it did not do

Eight seasons did not move: the tabu search ended where the page already was.
For four seasons, 1 count off might be the best possible. Neither solver
proved it either way. The exact-multiple seasons (24 x 24, 24 x 36, 26 x 26,
28 x 28) are still 4 to 16 counts off. Nobody knows yet whether an even split
exists for them with the circle-method rounds the page uses. The table, the
scripts and every figure are in the project's `eval/bowling-lane-table.txt`
and `eval/bowling-lane-near.txt`.
