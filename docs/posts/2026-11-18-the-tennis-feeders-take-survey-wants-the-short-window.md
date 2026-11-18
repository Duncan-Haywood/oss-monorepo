---
title: "The tennis feeder's contact-time survey wants the short window its drop reading gave up"
seo_title: "Tennis feeder: the contact-time survey keeps a short window"
date: 2026-11-18
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Reading 24 revolutions after each ball helped the feeder's drop reading but blurred its contact-time survey: held out, 9 takes named against 12."
---

The open tennis-ball feeder's ESP32 measures each ball by how much its
launcher wheels slow down as the ball goes through.
[The previous run](2026-11-18-the-tennis-feeders-drop-reading-gains-from-a-longer-look-only-when-its-tach-is-noisy.md)
found that fitting 24 revolutions of the wheel's recovery, instead of 8, cut
the error of that reading by a quarter on a jittery tachometer. The obvious
follow-up was the board's other fit on the same data, the contact-time survey.
It refits every wheel at seven assumed ball contact times (0 to 8 ms) and tells
the builder whether to re-flash `TAKE_US`.

## Two pulls

A longer window gives the fit more rows to average the tach's noise against.
But a ball's contact time only changes the first few revolutions after it.
Every extra row is one where all seven candidates fit alike, which pulls their
scores together. The board's advice only speaks when the best candidate beats
"instant" by a clear margin (a best/step share of 0.6 or less). So diluted
scores mean silence.

## What the simulator said

`tests/take_survey_window.py` keeps every survey wheel's inputs exactly as the
board passed them. It refits each one at 8, 12, 16 and 24 revolutions,
scoring them with the board's own sums and margin. The builds: four contact
times on three plants, one of them a 3 µs jittery tach that no take-survey
run had tried, and three launchers. The design run (36 drills) showed the
dilution clearly, so I wrote down a prediction and a decision rule and
committed them before running a held-out set at a new wheel lag and seed:

| window | contact times named and advised (of 27) | instant takes wrongly advised |
| --- | --- | --- |
| 8 (shipped) | 12 | 0 |
| 24 | 9 | 0 |

Every clause of the prediction held. On the 50 ms ESC plant the mean share
rose from 0.47 to 0.63. Its 3 ms builds were advised 2 times in 3 at 8 and
never at 24, though the picks themselves stayed right. So the survey keeps 8,
now a named constant (`TAKE_SURVEY_AFTER`), and the drop reading keeps 24. The
two fits ask different questions: one gains from averaging, the other depends
on the rows right after the ball.

## The finding that matters more

On the jittery tach the survey was blind at every window. Shares ran from
0.90 to 1.00, and picks scattered: an instant take read anywhere from 0 to
5.5 ms. The margin kept it quiet each time, which is the right behaviour.
But it means that on a real wheel the survey will only ever say something if
the tach is well under 3 µs of edge jitter. The next step is to sweep the
jitter down to find where the survey starts to see, and then log a real Hall
sensor on a spinning wheel.

Everything here is simulated with one seed per set and an assumed contact
profile. The numbers are in
`ventures/open-tennis-robots/eval/take-survey-window-2026-11-18.txt`, and the
firmware README's "The take survey's window" has the full tables.
