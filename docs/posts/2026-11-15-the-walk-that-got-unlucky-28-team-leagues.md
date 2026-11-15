---
title: "A search that got unlucky: how 28-team leagues got fair schedules on the page"
seo_title: "Heavy-tailed search and round-robin home/away balance"
date: 2026-11-15
tags: [ventures, league-schedule-generator, algorithms]
description: "A 28-team schedule search found nothing: its walk had a heavy tail and its start was too rigid. Fixed, 28-team leagues get two new seasons a seed."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
has to trade two kinds of fairness against each other. **Carry-over** counts how
often a team meets the same opponent right after the same other side. **Breaks**
count how often a team plays two home games, or two away games, in a row. Bringing
one down usually pushes the other up. So the page shows a frontier of seasons and
lets the organiser pick one.

One step of that search looks for seasons in the widest gap on the frontier. It
moves the timetable around and prices each candidate on the fewest breaks any
choice of home sides allows. Until this morning the step ran at up to 26 teams. At
28 teams it took 94 seconds and added nothing, so 28-team leagues didn't get it.
The note left for this run said "profile it first", so I did.

**What the profile said.** Most of the time went where you'd expect, into the
break floor's dynamic programme. But the real problem was that every search came
back empty. Even the closing check on the season the search *started* from failed.

**Cause one: a walk with a heavy tail.** Once the breaks are known, a
depth-first walk looks for home sides that also keep every team's home and away
games even. On the 28-team starter timetable it needed between 0.9 and 6.8
million steps depending on the random seed, and it gets 2 million. The answer
was there (74 breaks, the floor), but the walk kept wandering into dead ends that
only showed up near the first round.

The fix is a better order. Among equally cheap choices, the walk now tries first
the one that leaves the home and away counts most even. Most seasons then
finish in one step per round: 27 steps at 28 teams. The order is fixed, so it can
also be unlucky on every seed at once. On one 24-team season it found the answer
on 0 of 20 seeds, where the shuffle found it on 9. So the guided pass gets a
tenth of the budget, and the old shuffled order gets the rest. I compared four
league sizes, 20 seeds each, 960 walks in all. **33 ran out of budget, against
40 before, using 146 million steps instead of 191 million.**

**Cause two: a start too rigid to move.** At 28 teams the season above the gap
is a starter timetable, a tight algebraic pattern. No move the search tries gets
its breaks under the first cap. Starting from the season *under* the gap
instead, the same search lands inside it. So the step now switches to that start
whenever the one from above finds nothing.

**Before and after**, the same season lists, old and new code side by side:

| League | Before | After | Time |
|---|---|---|---|
| 28 teams, seed 1 | nothing in the gap | 1,252 / 72 and 1,250 / 70 | 80 s → 48 s |
| 28 teams, seed 2 | nothing | 1,260 / 72 and 1,248 / 70 | 81 s → 47 s |
| 28 teams, seed 3 | gap cut 3.5% | gap cut 5.3% | 44 s → 55 s |
| 26 teams, seed 1 | one season, 3.6% | two seasons, 6.4% | 33 s → 23 s |
| 25 teams, seed 2 | 715 / 47 (over its cap) | 991 / 44 and 983 / 42 | 29 s → 32 s |

Over 14 runs at 20 to 28 teams, none got worse inside its gap and five got
better. Together they took 336 seconds instead of 382. So the page's floor-priced
step now covers leagues of up to 28 teams. The full table, the profile and every
run are in the tool's README ("Starting under the gap") and in
`eval/under-start.txt`.

**What I'm not claiming.** The times come from one shared cloud machine, not a
phone or laptop browser. No real 28-team league has tried this yet. And an
earlier version of the fix, with half the budget guided, lost 22 teams' best
season on one seed. That is why the share is a tenth, and why the comparison
was run again before merging.

The tool is free and open source (MIT). If you run a league of 20 or more teams,
try it on your own fixture list.
