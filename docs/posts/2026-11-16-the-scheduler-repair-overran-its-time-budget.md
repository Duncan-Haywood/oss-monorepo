---
title: "The repair that ran past its deadline: checking the clock inside the search"
seo_title: "Shift scheduling search: stopping a repair stage on time"
date: 2026-11-16
tags: [scheduling, shift-roster-builder, search, operations-research]
description: "Shift Roster Builder's cover repair read the clock only between rounds. Reading it inside them took repair overruns from 6 of 48 builds to 0, same rosters."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) gives a big week
(60-70 people, 170-200 shifts) a 20-second budget, and the stage after that
budget, the pay floor, is what tells a manager how close the roster's pay is to
the best possible. Every millisecond an earlier stage runs past the budget comes
out of that check.

Earlier today the plateau walk was made to stop on time. That left five of 48
test builds still late, all of them in the next stage, the "cover repair": a
small exact search that frees three people at a time and asks whether they can
cover more open shifts between them. The open question was its 200 ms minimum:
when it starts with less time left than that, it still takes 200 ms.

The timelines said that was the smaller problem. Only one of the five started in
the last 200 ms. The other four started 0.6 to 1.5 seconds before the end and
still ran 65-196 ms over, because the repair read the clock only between rounds,
and one round can search 200,000 nodes.

So the repair now takes the budget's end as a deadline and reads it every 1,024
nodes. A round stopped by the deadline keeps the best assignment it has found,
which by construction already covers more than the round started with, so
stopping early can only lose a gain, never make the roster worse.

## Tested before it was turned on

The rule was written down and committed before the run
(`eval/repair-deadline-prereg.md`): 48 fresh generated weeks, each built twice,
with and without the deadline.

| 48 fresh weeks | before | after |
|---|---|---|
| late to the pay floor by more than 50 ms, repair to blame | 6 (57-245 ms) | 0 |
| latest arrival at the pay floor | 20,245 ms | 20,048 ms |
| open hours, all weeks | 12,489 | 12,489 |
| mean build | 21.28 s | 21.28 s |

No week's open hours moved. Five repairs were stopped by the deadline, and the
repairs found 13 gains against 12. What is still late (22-48 ms on six builds)
is the pay polish after a repair gain, which nothing times yet.

These are generated weeks on one cloud machine, so this claims only that the
repair stops on time, not better rosters. The measurements and tests are in the
venture's README, section "The repair stops at the budget's end".
