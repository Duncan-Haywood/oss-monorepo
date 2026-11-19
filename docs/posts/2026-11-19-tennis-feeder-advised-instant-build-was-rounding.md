---
title: "The tennis feeder's one wrong contact-time advice came from rounding to whole ppm"
seo_title: "Tennis feeder: a wrong advice traced to whole-ppm rounding"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "One simulated build with an instant take was told to set a 3.5 ms contact time. Its frame rounded 6.81 and 4.32 ppm to 7 and 4. A guard now catches it."
---

The open tennis-ball feeder's ESP32 estimates how long each ball stays in
contact with the launcher wheels. It refits every ball's speed drop at a grid
of assumed contact times and sends the Pi each candidate's mean misfit, in
parts per million of the wheel's speed. The Pi says "set TAKE_US" only when
the best candidate's misfit is at most 0.6 of the step's (an instant take).

Since 18 November one simulated build had stood out. Its take was instant,
yet with the tach's periods timed to 1/8 microsecond the survey advised
3.5 ms at a share of 0.57. A later filter that drops uninformative wheels
made the advice go away, but nobody had said why it was there.

## Whole ppm at a 7 ppm floor

At 1/8 µs the fits are so good that the misfits are single-digit ppm, and
the frame sends them as whole numbers. That build's frame carried 7 for the
step and 4 for 3 ms (6.81 and 4.32 unrounded): 4 / 7 = 0.571. The board's own sums give
0.635, outside the margin. The filter didn't fix anything. It moved a
rounded 4 to a 5 while the exact share stayed at 0.63.

Over the 38 stored simulation files (5,012 scorings), rounded and exact
shares land on opposite sides of 0.6 only nine times. Eight of those sit
within 0.011 of the line. This build is the only large one, because its
step misfit is the smallest.

## A guard, tested before it shipped

Each rounded number is good to ±0.5 ppm, so the largest share a frame can
hide is (best + 0.5) / (step − 0.5). Now the Pi advises only when that bound
is inside the margin. The rule for shipping it was committed before a fresh
simulated set of 72 drills ran. On that set it changed nothing: 53 of 54
spread takes were named and advised either way, and no instant take was
advised. On the stored sets it holds back 6 of 1,244 correct advices.

The guard only proves it costs nothing on fresh data. The benefit rests on
the one traced build. The real fix is a frame that carries tenths of a ppm,
which is the next buildable item. Along the way, three of the project's
rescoring scripts were crashing on every stored file since the grid grew
from seven points to nine. They now read each file's own grid.

Everything here is simulated. Details are in the feeder's
[firmware README](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/open-tennis-robots/firmware/esp32/README.md)
and `eval/take-share-rounding-2026-11-19.md`.
