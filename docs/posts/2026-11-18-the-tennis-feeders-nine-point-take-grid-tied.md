---
title: "The tennis feeder's nine-point take grid tied on fresh data, so the old grid stays"
seo_title: "Tennis feeder: the nine-point take grid tied held out"
date: 2026-11-18
tags: [open-tennis-robots, firmware, simulation, methodology]
description: "A finer contact-time grid looked better on the sets that suggested it. On three fresh sets with fairer takes it tied, so the old grid stays."
---

The open tennis-ball feeder's ESP32 can survey how long a ball stays in
contact with its launcher wheels: the "take". It refits each wheel's speed
drop at a grid of candidate contact times and reports the one that fits best.
The shipped grid is 0, 2, 3, 4, 5, 6 and 8 ms. An earlier run scored a finer
grid, every millisecond from 0 to 8, offline on three simulated sets, and it
won: 47 to 52 builds read within half a millisecond, against 43 to 48. It did
not change the firmware. The result came from the same rows that suggested
it, and the finer grid costs two more fits per wheel and a longer telemetry
frame. This run's job was to decide it on data nobody had used
([firmware README](../../ventures/open-tennis-robots/firmware/esp32/README.md),
"The nine-point take grid on its own held-out sets").

## A bias in the first comparison

The earlier sets put their "between the grid points" takes at 1, 2.5, 3.5,
4.5, 5.5 and 7 ms. Two of those six, 1 and 7 ms, sit exactly on points the
finer grid adds. On those takes the finer grid is handed the answer. A real
ball's contact time is not on anyone's grid.

So the fresh sets used takes on the half-millisecond, 0.5 to 7.5 ms. Each one
is half a millisecond from the nearest point of either grid. The capture
script gained a `--takes` option for this. Three sets with wheel lags and
seeds no earlier run used, 54 simulated survey drills each, and a five-clause
decision rule committed before any of them ran. The finer grid would be
adopted only if it had more builds within 0.5 ms, pooled, and lost nothing
on the other measures.

## The result

| | shipped grid | nine-point grid |
| --- | --- | --- |
| within 0.5 ms (pooled, 162 builds) | 141 | 141 |
| within 1 ms | 142 | 152 |
| spread takes named and advised | 92 | 93 |
| instant builds wrongly advised | 0 | 0 |

An exact tie on the measure that decides, on every one of the three sets
(48, 47 and 46 each). A tie keeps the cheaper grid, so the firmware is
unchanged. Of the three predictions, one failed (no gain within 0.5 ms), one
half held (the grids agree between 2 and 6 ms on 94% of builds, but the
finer grid did slightly worse on 0.5 ms takes), and one held (no instant
build advised).

## What the tie hides

The Pi rounds the board's pick to half a millisecond. At a 7.5 ms take, the
shipped grid read 8.0 on all 18 builds, and that counts as within 0.5 ms. At
6.5 ms it read 6.0, which counts too. The finer grid read 7 or 7.5, and 6.5,
and got the same credit. The measure the rule named cannot tell those apart.

On other measures from the same tables, the finer grid looks better. Builds
off by more than a millisecond halve, from 20 to 10, mostly 1.5 ms takes the
shipped grid reads as zero. Mean absolute error drops from 0.53 to 0.45 ms.
But picking one of those measures now, after seeing which one favours the
change, is the move a pre-registered rule exists to stop. So it goes on the
list as a new test: a fresh set with "builds off by more than 1 ms" named as
the bar before the capture runs.

Everything here is simulated: a first-order wheel model and an assumed
half-sine force profile for the ball. The rows, the per-build tables and the
commands are in
[`eval/take-grid-nine-2026-11-18.md`](../../ventures/open-tennis-robots/eval/take-grid-nine-2026-11-18.md).
