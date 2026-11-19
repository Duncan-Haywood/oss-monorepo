---
title: "One more grid point in the tennis feeder's contact-time survey, and the test it had to pass first"
seo_title: "Tennis feeder: a 7 ms grid point that passed its own test"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Adding 7 ms to the feeder's contact-time grid put 185 of 216 held-out builds within 0.5 ms against 149, for 11% more survey time. It ships."
---

The open tennis-ball feeder's ESP32 estimates how long each ball stays in
contact with the launcher wheels (the "take"). It refits each ball's speed
drop at a handful of assumed contact times and picks where the summed
residual is lowest, with a parabola through the best point and its two
neighbours. Until today those times were 0, 2, 3, 4, 5, 6 and 8 ms.

Yesterday's runs kept finding the same thing at the top of that grid: with
nothing between 6 and 8 ms, a contact of about 7 ms read as 8.0 every time.
A nine-point grid (every millisecond) looked better on that, but its rule,
written before the data, asked for fewer large misses, and it did not get
them. Picking it afterwards on a different measure would have been the
forking path the rule is there to stop. So the cheaper fix, adding only
7 ms, got its own test with its own measure named first: builds read within
0.5 ms of the true contact time.

## A design change before any data

The first draw of test contact times (one random value in each millisecond)
put nothing between 6.5 and 7.5 ms. That is the only band where a 7 ms point
can change a verdict across the 0.5 ms bar, so the test could not have
answered its question. Before any capture ran, the draw was replaced by a
stratified one: one contact time in each millisecond from 0 to 5, and one in
each half millisecond from 5 to 8. The post-mortem file says so in plain
words, because a test designed after looking at something has to say what it
looked at.

The prediction and a six-clause rule went into a commit next: at least six
more builds within 0.5 ms, no more large misses, no higher mean error, the
same re-flash advice, no instant-contact build advised, and no set worse.

## What happened

Three fresh simulated sets, 216 survey drills, none aborted:

| | 7-point grid | 8-point grid |
| --- | --- | --- |
| within 0.5 ms | 149 | 185 |
| off by more than 1 ms | 15 | 15 |
| mean absolute error | 0.463 ms | 0.373 ms |
| instant builds advised | 0 | 0 |

Every clause held, so the grid is now 0 to 8 ms with only the 1 ms point
missing. The gains came at 6.6 ms (2 of 18 builds within 0.5 ms became 17)
and 7.15 ms (5 became 18). One gain was not predicted. At 6.1 ms the old
parabola leaned toward 5 ms on 10 of 18 builds, because it had only 5 and
8 ms on either side of a minimum at 6.

The 15 large misses did not move, and they are the same builds on both
grids, all at contact times of 2.35 ms or less. They come from the fit, not
the grid: when a short contact falls inside one revolution of the tach, a
revolution's average speed cannot tell it from an instant one. No grid point
fixes that, so it is the next problem.

## What it costs

There is one more refit per wheel. On the simulated 12-ball calibration
drill, the Pi now holds balls for the board's surveys for 127 s instead of
114 s, still under the 12 s per-ball cap with nothing dropped. The board's
report frame grows by two bytes. The Pi still reads the shorter frames older
firmware sends, so a board and a Pi on different versions keep working.

Everything here is simulated, with a continuous half-sine contact. Nobody
has measured how long a real ball stays on a real wheel, so whether real
contacts land in the 6 to 7.5 ms band where this helps is unknown. The rows,
the scripts and the commit-ordered prediction are in
`ventures/open-tennis-robots/eval/take-grid-eight-2026-11-19.md`.
