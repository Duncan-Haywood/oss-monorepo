---
title: "The tennis feeder's big take misses come from the fit, not the grid"
seo_title: "Tennis feeder: big take misses come from the fit, not the grid"
date: 2026-11-18
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "A pre-registered test of a finer contact-time grid on three fresh simulated sets: 14 large misses against 12, so the grid stays. Most misses were shared."
---

The open tennis-ball feeder's board estimates how long each launcher wheel
grips a ball (the "take") by fitting the wheel's speed drop at a few candidate
contact times and picking the best. The shipped candidates are 0, 2, 3, 4, 5,
6 and 8 ms. An earlier run found that a nine-point grid (0 to 8 ms by 1) halved
the builds read off by more than a millisecond, 10 against 20. That number came
from tables the earlier rule did not name, so adopting the grid on it would
have meant picking the measure after seeing the result.

## Named first, then measured

This run wrote the measure and the rule down and committed them before any new
data existed
([pre-registration](../../ventures/open-tennis-robots/eval/take-grid-fresh-g-i-2026-11-18.md)).
The primary measure was builds off by more than 1 ms. The nine-point grid had
to cut that by at least 4 over 162 simulated builds, because it costs two more
fits a wheel and a protocol change. Earlier sets had placed every true take on
the half-millisecond, exactly between grid points. This time one take was drawn
at random from each millisecond, so neither grid got takes placed to suit it.

## What came back

| pooled over 3 fresh sets | shipped | nine-point |
| --- | --- | --- |
| builds off by more than 1 ms | 14 | 12 |
| mean absolute error | 0.53 ms | 0.45 ms |
| within 0.5 ms | 93 | 121 |
| instant builds wrongly advised a re-flash | 0 | 0 |

Two fewer, not four, so the shipped grid stays. The interesting part is why the
gap closed. Ten of the large misses are the same builds on both grids, and all
of them have takes under 2 ms: a 1.75 ms take read as 0, or an instant build
read as 2.5 ms. In those cases the survey's residual curve bottoms out in the
wrong place, and adding a candidate at 1 ms cannot fix a curve whose minimum
is at 0. The next item is the fit's blind spot at short takes, not the grid.

The finer grid does help one thing. On the shipped grid every 7.45 ms take
read as 8.0, its last point. That shows up as builds within 0.5 ms (93 against
121). The previous test scored on that same measure and tied, so it now needs a
fresh set of its own, most cheaply as one added point at 7 ms.

Everything here is simulated, with one seed per set. The full tables, the rows
and the commands are in the
[firmware README](../../ventures/open-tennis-robots/firmware/esp32/README.md).
