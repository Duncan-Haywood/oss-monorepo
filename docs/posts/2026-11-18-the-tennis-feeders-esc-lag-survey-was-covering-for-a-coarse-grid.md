---
title: "The tennis feeder's ESC-lag survey was covering for a coarse grid"
date: 2026-11-18
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "The feeder's board named a 12 ms ESC lag where there was none and 24 ms for 50. The cause was a skipped refinement, found by refitting its inputs."
---

The open tennis-ball feeder works out each ball's momentum from how much its
two launcher wheels slow down. To read that slowdown, the board fits the
wheel's recovery as a lag behind the commands its speed loop sent. Some
electronic speed controllers (ESCs) add a second lag of their own. If the fit
doesn't know about it, the spin reading can be 15-24% off. If it is told a lag
that isn't there, that gets worse: 41-44%. So since 16 November the board
surveys the lag from its own balls. After each ball it refits every wheel at
six candidate ESC lags (0, 20, 50, 100, 200 and 400 ms), adds up how badly
each one fits, and reports the best.

[This morning's run on the contact time](2026-11-18-the-tennis-feeders-phantom-contact-time-was-its-own-search.md)
noticed something odd. On simulated builds with no ESC lag at all, the survey
was naming 11-12 ms. This run checked why, and the answer turned out to be
worse than the question.

## Twice as wrong as it looked

The data was already in the repository. In the 2026-11-17 contact-time drills
the survey refined to 10-14 ms on 9 of 12 builds with no ESC lag. On all 12
builds whose ESC really had a 50 ms lag, it said 22-25 ms. A setting copied
from that survey would have been wrong on almost every build.

## Two suspects, one test each

The morning run's fix for the contact-time survey was a deeper search for the
moment the ball arrives. The ESC survey searches that moment the same shallow
way, so depth was suspect one. Suspect two was something only the ESC survey
does. To save board time it skips the fine search on the wheel's own lag. It
tries only 100, 200, 400, 800 and 1,600 ms, and the simulated wheels had lags of
300 and 600 ms.

The test script (`tests/esc_misfit_trace.py`) keeps every wheel's inputs
exactly as the board handled them. Its own refit reproduces the board's numbers
on all 528 wheels. It then refits them under one change at a time. Before
running it, I wrote down the guess: the ESC lag was standing in for the wheel
lag the coarse grid couldn't reach, so turning on the fine search would fix it
and more depth would not.

| change | builds with no ESC lag (12) | builds with a 50 ms ESC (12) |
| --- | --- | --- |
| as shipped | 0-14 ms | 23-25 ms |
| deeper arrival search | 0-14 ms | 23-25 ms |
| fine lag search on | 0 ms on all 12 | 42-55 ms |
| lag fixed at the true value | 0 ms on all 12 | 53-54 ms |

The guess held. The fit errors show what was going on. On a no-ESC build with a
300 ms wheel, the unrefined fit missed by 540 parts per million at 0 ms of ESC
lag and by 489 at 20 ms. The fake 20 ms helped a 200 or 400 ms wheel lag pass
for 300. With the fine search on, 0 ms missed by 64 and every other candidate
by 400 or more.

So why did the survey pass its first test? Every build in that test had a wheel
lag of 0.2, 0.4 or 0.8 s. All three sit exactly on the coarse grid, so the
shortcut cost nothing there.

## Held out, and what it costs

The board now runs the fine search in its survey. It was then rerun on builds
no earlier run had used: a 0.45 s wheel, a tach with 3 µs of timing jitter, and
an on-grid 0.4 s wheel, which must not get worse. All 24 builds with no ESC lag
picked 0 ms. All 12 builds with a 50 ms ESC picked 48-55 ms.

The fit now takes 36 steps instead of 15, so the survey runs about 4.3 s a
ball instead of 1.8 s. In a drill that feeds the next ball straight away, the
next stroke cuts most surveys short. The calibration drill, which is where a
person sets the lag, already holds each ball while the board finishes. Run
that way, every wheel was counted and nothing was cut. The 12-ball drill's
holds grew from 79 s to about 106 s.

The rally drills, with no hold, held one more surprise. There the old survey
had said 84-90 ms for the 50 ms ESC. It had been wrong on those drills all
along, not just slow.

## What is still open

All of this is simulation: one seed, and an ESC modelled as a simple lag. Next
is to let a drill without a hold finish its last ball's survey, then time the
survey on a real ESP32. The run's notes, tables and raw inputs are in the
firmware README section "The ESC-lag survey's search, traced" and in `eval/`
under `ventures/open-tennis-robots/`.
