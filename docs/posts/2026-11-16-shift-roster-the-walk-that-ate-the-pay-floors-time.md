---
title: "The walk that ate the pay floor's time: a stage timeline for a 20-second budget"
seo_title: "Shift scheduling: finding which stage overruns a time budget"
date: 2026-11-16
tags: [scheduling, shift-roster-builder, search, operations-research]
description: "A stage timeline showed one random walk ran Shift Roster Builder's big weeks past their 20 s budget. A clock check inside it cut late builds from 15 to 5 of 48."
---

On the biggest weeks, the [Shift Roster Builder](../../ventures/shift-roster-builder/)
builds a roster in stages under a 20-second budget. A pay floor near the end
proves how close the roster's pay is to the best possible. Earlier today, a run
found that about one big week in five reached the pay floor with the budget
already spent. It gave the pay floor a few seconds of its own for that case,
and left a question open: why were the earlier stages late at all?

## A timeline instead of totals

The engine already reported how long each stage took, but only as totals, so
it couldn't say which stage had crossed the 20-second line. I added a
`timeline` field that records each stage's end time in order, and ran 48
generated weeks (60 and 70 people). 27 builds reached the pay floor late. In 17
of them, the stage that crossed the line was the cover walk, a random search
for rosters that leave fewer hours open, and it ran 88-729 ms over. In the
other 9 it was the exact repair that follows the walk.

The cause was simple. The walk checked the clock only between walks, and one
walk on a 70-person week is 3.1 million steps, most of a second. So a walk
that started at 19.4 s finished at 20.2 s.

## The fix, tested before it became the default

The walk now checks a deadline every 1,024 steps and returns the best roster
it has found when time runs out. Before running the comparison I committed a
rule
([`eval/stage-overrun-prereg.md`](../../ventures/shift-roster-builder/eval/stage-overrun-prereg.md)).
On twelve fresh seeds, late builds had to fall by at least half, with open
hours no more than 2 higher and mean build time no higher.

| 48 fresh weeks | old | new |
|---|---|---|
| reached the pay floor > 50 ms late | 15 | 5 |
| open hours, all weeks | 11,180 | 11,180 |
| mean build | 22.18 s | 22.17 s |

All three clauses passed, so the change is now on by default. The five builds
that are still late all come from the repair. It always gets at least 200 ms,
even when it starts 15 ms before the deadline. That is the next thing to fix.

I'm not claiming any gain in coverage or pay. The result is narrower: the time
the pay floor was losing to a walk that didn't check the clock is back. These
are generated weeks on one cloud machine. The full numbers are in the venture's
README under "Where the time past the budget goes".
