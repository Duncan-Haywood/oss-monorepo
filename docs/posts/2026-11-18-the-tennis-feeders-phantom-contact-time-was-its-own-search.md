---
title: "The tennis feeder's phantom contact time came from its own search, not the physics"
seo_title: "A phantom contact time traced to the feeder's own search"
date: 2026-11-18
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Balls that left the feeder's wheels instantly kept being read as 2.5 ms contacts. The cause was a search that sometimes lands in the wrong basin."
---

The open tennis-ball feeder works out each ball's momentum from how much its two
launcher wheels slow down. Earlier today
([the contact-time survey](2026-11-18-the-tennis-feeder-learns-how-long-a-ball-touches-its-wheels.md))
the feeder's ESP32 learned to refit each calibration ball at seven contact
times, from instant up to 8 ms, and to name the one that fits best. Contacts
that really were spread out were named within a millisecond. One result didn't
fit, though. On one simulated plant, balls that left the wheels instantly were
named as 2.5 ms contacts on all three builds, and a board told that value read
worse. A safety margin kept that advice from reaching a person, but nobody knew
the cause. The guess written down was the simulator's own time step.

## Not the physics

This run's script, `tests/take_misfit_trace.py`, kept every drop fit's inputs
from those builds and refit them offline, changing one thing at a time. The
changes were: the wheel's lag fixed at its true value, every command shifted by
up to a millisecond either way, an exact plant step in place of the simulator's
Euler step, and a step five times finer. Even before any change, every build at
the troublesome wheel lag picked an instant contact. One build at the other lag
picked 2 ms, by 6 parts per million of the wheel's speed. The fits the board
reports did not carry the error at all.

## The board's own search

So the run reproduced the survey itself, and got the board's sums to the digit.
Listing each wheel's seven fits showed the problem straight away. Most candidate
contact times fitted a wheel equally well, about 25 parts per million. Now and
then one candidate jumped 3 to 12 times higher, and every time its search for
the wheel's lag had stopped at 277 to 330 ms instead of the true 300.

The fit looks for the ball's moment on three nested grids. The first grid has
nine points across two or three revolutions. On a noise-free wheel the right
answer sits in a narrow dip, and the coarse grid sometimes settles in the wrong
dip instead. The finer grids then search only around that wrong point. Plotted
against the lag, the fit's error has cliffs: 227 parts per million at 300 ms,
42 at 305. The search over the lag follows those cliffs. The survey adds up
squared errors, so five wheels whose instant-contact fit had missed outvoted
the other 17. That is the whole 2.5 ms.

## Searching two levels finer

Refitting the board's own survey inputs, 48 drills across four contact profiles,
two plants, three launchers and two wheel lags:

| contact (12 builds) | 3 levels (shipped): named within 1 ms, advised | 5 levels |
| --- | --- | --- |
| instant | 7, 0 | 12, 0 |
| half-sine 3 ms | 9, 3 | 10, 5 |
| half-sine 6 ms | 12, 10 | 12, 12 |
| front-loaded 4 ms | 8, 5 | 11, 7 |

The prediction written beforehand was for four levels, and four levels missed
by one build. Five levels was chosen after seeing this table. So the board now
runs five levels, and the drills were rerun at a wheel lag no earlier run had
used, 0.45 s. There, the 6 ms, 3 ms and front-loaded contacts were named to the
half millisecond on all six builds each; at three levels the 3 ms contact was
named on only half. No instant build was advised. One did pick 2.5 ms, but only
on a tie with the instant fit, which the advice already turns into "keep 0".

## What it costs and what is open

Only the survey searches deeper. The reading each ball reports keeps its three
levels, because its scatter barely moved: 0.12 to 0.16% either way. A
calibration drill now holds its balls for 79 s in all (42 s before), and the
Pi's per-ball wait went from 8 s to 12 s.

All of this is simulated on noise-free plants. The board's other survey, which
picks the ESC's own lag, searches the same shallow way. On these builds it named
an 11 to 12 ms lag on a plant that has none, which may be the same cliffs. That
is the next thing to check, then timing a real ESP32. The full write-up, with
every table, is in the firmware README's "The first-order take misfit traced".
