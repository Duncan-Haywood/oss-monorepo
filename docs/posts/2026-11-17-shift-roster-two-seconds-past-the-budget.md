---
title: "Two seconds past the budget: what a scheduler's last search stage buys"
seo_title: "Shift scheduling search: are 2 s past the time budget worth it?"
date: 2026-11-17
tags: [scheduling, shift-roster-builder, search, operations-research]
description: "Shift Roster Builder's day sweeps run 2 s past a spent 20 s budget. Logged gain by gain on 23 builds, the last 1.5 s covered 2 of 11 open hours. They stay."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) builds big
weeks under a 20-second time budget. Over the last few days, one stage after
another learned to stop at the end of that budget. Even so, a 60-70 person week
still takes 22 s on average and 28 s at worst. The timelines of the last 48
test builds show where the extra time goes. About half of it is the pay floor,
a lower bound that keeps a 4 s reserve on purpose. The other half is the
**day sweeps**, which take exactly 2.0 s on every build that runs them,
whatever the clock says.

The day sweeps re-solve one day at a time, exactly, with the rest of the week
held fixed. They run in three phases: a first set of plain sweeps; a "guided
ladder" that tilts each day's costs toward an LP's solution; and then random
"kicks" until the 2 s are up. Is that worth 2 s on a week whose budget is
already gone?

## Logging every gain

The pass now records each improvement it finds, with its time and phase
(`optimality.dayLNS.gains`). I ran 24 generated weeks (seeds 66-71, 60 x 168
and 70 x 196 shift copies, two weeks each); the pass ran on 23 of them.

| phase, 23 builds | when | open hours it covered |
|---|---|---|
| first sweeps | 15-55 ms | 0 (pay only) |
| guided ladder | by 400 ms | 9 |
| random kicks | 250-1,870 ms | 2 (at 866 ms and 1,155 ms) |

A 500 ms window would have kept 9 of the 11 open hours and 82% of the score
saved. A 1 s window would have kept 10 of the 11. The last two hours each came
from a kick late in the window, on a 70-person week where the pay floor hadn't
finished. In this scheduler an uncovered hour costs more than any pay saving,
so 1.5 s to cover one more hour on 2 of 23 builds is a fair trade. The window
stays at 2 s.

## Running the ladder twice found nothing

Most of the cover came from the guided ladder, so the next idea was obvious: run
it again from the improved roster before falling back to random kicks. These
builds turn out to be deterministic up to this stage (all 24 entered it at the
same score both ways), so the comparison is exact. The second ladder found
nothing on any build, and open hours were 6,064 with and without it. The option
(`dayGuideRepeat`) stays off and is kept so anyone can re-run the test.

## What this does and doesn't say

These are generated weeks on one cloud machine, run two at a time. It's an
exploration set, not a pre-registered test, because no default changed. And 2
of 11 hours is a small count. What it does settle is the open question from the
last post: the time a build spends past its budget now goes to two stages that
both earn it, not to stages that overran by accident. Details are in the
README section "The day sweeps past a spent budget" and in
`eval/day-lns-spent-summary.py`.
