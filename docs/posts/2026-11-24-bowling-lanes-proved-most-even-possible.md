---
title: "When a bowling schedule can't be even: proving the page's lane split is the best possible"
seo_title: "Proving a bowling lane split is the best possible"
date: 2026-11-24
tags: [combinatorics, constraint-programming, bowling, league-schedule-generator]
description: "CP-SAT proved the fewest uneven lane counts for 39 bowling seasons. The page already met 38 of them; 20 teams over 10 weeks went from 22 to 20."
---

The [League Schedule Generator](../../ventures/league-schedule-generator/)
bowling page rotates teams across lane pairs so that each team bowls on every
pair about equally often. For some seasons that is impossible. A league of 20
teams on 10 pairs over 10 weeks would need every team on 10 different pairs,
and a SAT solver had already proved that no deal of those weeks does it. The
page said so. What it could not say was whether its own deal was as close as
any deal could get.

## Measuring "as close as possible"

The page scores a deal by counting, for every team and pair, how far the count
sits outside its fair range (floor to ceiling of weeks divided by pairs). A team
that bowls twice on one pair in a 10-week, 10-pair season, and so misses
another pair, costs 2. A schedule at 0 is perfectly even.

The CP-SAT model behind earlier runs treated the fair range as a hard rule.
This run made it soft: counts may leave the range, each step outside costs 1,
and the solver minimises the total (`eval/bowling-mirror-cpsat.py --soft`).
When CP-SAT reports OPTIMAL, its answer equals a lower bound it has proved, so
no deal of those weeks can do better.

## What it found

All 44 seasons on the "can't be even" list went through it. CP-SAT proved the
minimum on 39 of them: every one up to 20 teams. 18 teams over 9 weeks took
152 seconds and 20 over 10 took 114.

| Teams x weeks | Proved minimum | Page before | Page now |
| --- | --- | --- | --- |
| 12 x 6 | 12 | 12 | 12 |
| 16 x 8 | 16 | 16 | 16 |
| 18 x 9 | 16 | 16 | 16 |
| 20 x 10 | 20 | 22 | 20 |

The page's own search was already at the minimum on 38 of the 39. On 20 x 10
it was 2 counts over. The solver's answer is now stored and the page builds
it. For all 39 seasons the page now adds a sentence: the deal is the most even
one possible, with the proved minimum next to its own count.

From 22 teams up, 600 seconds gave no useful bound: 12 against an answer of 24
for 22 x 11, and 1 for 28 x 14. The page makes no claim there. The same runs
did find a closer deal for two big seasons: 26 teams over 13 weeks from 30 to
28, and 26 over 39 weeks from 14 to 12, starting from the stored answer.

## What did not move

Starting from stored answers left 24 x 11, 28 x 13, 26 x 26, 28 x 14 and
28 x 28 where they were. Thirty minutes of the mirror-symmetry search on four
cores found nothing for 24 x 24. Whether those seasons can get closer is still
open. Every run, including the failures, is in
`eval/bowling-lane-min-2026-11-24.txt`.

## Why a proof matters to a league secretary

A secretary who sees one team on pair 5 twice will ask whether a better
schedule exists. Before this run the honest answer was "maybe". For those 39
seasons it is now "no, and here is the count that proves it", which is the
answer that ends the argument at the league meeting.
