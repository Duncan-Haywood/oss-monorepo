---
title: "Flip every host: a free factor of two in the break floor, and why 30 teams still wait"
seo_title: "Round-robin home/away breaks: a symmetry that halves the table"
date: 2026-11-16
tags: [ventures, league-schedule-generator, algorithms]
description: "Swapping home and away for every game leaves a season's breaks unchanged. The schedule generator now uses that to halve its tables. 30 teams are still too slow."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
tries to give each team as few **breaks** as it can: a break is two home games
in a row, or two away games in a row. For a fixed timetable (who plays whom in
each round) it can prove the fewest breaks possible, using a dynamic programme
that walks the season one round at a time. Inside the page that proof is the
price of every move in a search that trades carry-over against breaks.

Today's task was to bring that search to 29- and 30-team leagues. It now runs
up to 28 teams.

## What 30 teams cost

With the size limits lifted on a test copy, a 30-team league took **128
seconds** of worker time, compared with 47 to 64 seconds at 28 teams. It added
one or two schedules per seed, but only near the top of a very wide gap. On
seed 1 the options jump from 1,110 carry-over with 84 breaks to 2,542 with 68,
and the search filled in 1,152 / 82. 29 teams added nothing in 110 seconds.
Almost all of the time (116 of 128 s) went to the break programme's table
steps.

## The symmetry

Here is the observation. Take any season and swap home and away in **every**
game. Two home games in a row become two away games in a row, so every team
has exactly the breaks it had before.

So every table the programme builds has a mirror in it: the best breaks for a
round's hosts x equal the best for the flipped hosts. That means half of each
table is redundant. The code now fixes one host bit of the next round to
"home", turns that match's two teams into simple per-bit costs, runs the step
on one bit fewer, and reads the other half back from the mirror. The extra
work happens inside the WebAssembly copy loops, so JavaScript makes no extra
pass. A first version that did those passes in JavaScript was slower than
the plain step.

Which bit gets fixed matters. Fixing the first bit the elimination meets
halves every table after the first step: 0.44 to 0.35 ms a step at 30 teams.
Scoring every bit to pick the best one picks better, but the scoring costs
more than it saves.

## What it bought

Same schedules in every run, with the old and new code running side by side:

| League | before | after |
|---|---|---|
| 28 teams, 3 seeds | 175.5 s | 157.3 s (−10%) |
| 26 teams, 2 seeds | 48.0 s | 45.2 s (−6%) |
| 30 teams, seed 1 | 129.2 s | 103.8 s (−20%) |

That's a real but modest gain. 30 teams still cost twice what 28 do, for
schedules near the top of the gap, so 29 and 30 stay off the page. The profile
says where to go next: the copy into and out of the WebAssembly module now
costs about as much as the step itself, so the tables should stay in the
module between steps.

The numbers are from one shared cloud machine, not a phone. The details,
tests and raw runs are in the venture's README ("Half the table") and
`eval/symmetric-step.txt`.
