---
title: "The tennis feeder's short contacts weren't invisible, and the fix missed its own test by one build"
seo_title: "Tennis feeder: short contacts were visible, the fix failed by one"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Short ball-on-wheel contacts were visible to the feeder's fit all along. A new grid cut large misses from 11 to 3, then failed its rule on one build."
---

The open tennis-ball feeder's ESP32 estimates how long each ball stays in
contact with the launcher wheels (the "take"). It refits each ball's speed
drop at a set of assumed contact times, 0, 2, 3, 4, 5, 6, 7 and 8 ms since
this morning, and picks the time where the summed residual is lowest. The Pi
uses that pick to tell the owner whether to re-flash the board with a
different contact time.

Yesterday's write-up ended with a claim. Every build that missed by more
than 1 ms had a contact of 2.35 ms or less, and the same builds missed on
every grid tried, so the misses were called "the fit's". The idea was that a
contact shorter than one tach revolution looks like an instant one. Today's
run tested that claim instead of building on it.

## The fit could see them

The test needed no new simulation. Each wheel the survey recorded can be
refitted offline at every quarter millisecond from 0 to 8 ms, which gives the
whole residual curve, not only the eight grid points. If the fit were blind,
that curve would bottom out near 0 for a 1.5 ms contact.

It mostly didn't. On the three held-out sets from this morning, the summed
curve's lowest point was within 0.5 ms of a true 1.5 ms contact on 13 of 18
builds. The prediction, committed before the curves were printed, was at
least 12. Across every contact time it was right on 197 of 216 builds.

The curve has a shape the grid handles badly. It is a flat shelf from 0 up
to about a millisecond below the true contact, then a valley at the contact.
With points only at 0, 2 and 3 ms, a 1.5 ms valley falls between the shelf
and 2 ms, and the pick reads 0 or 1. A 2.35 ms contact gets a parabola
through 0, 2 and 3 ms that leans back into the shelf and reads 1 to 1.5. So
the misses come from the grid and the pick, not from the fit.

## The first fix failed

The pre-registered fix was to fit a parabola through the first three points
whenever 0 ms wins. It failed. On an instant contact the shelf is flat, so
the vertex can land anywhere between 0 and 2 ms. It moved 10 instant builds
off zero, against 3 for the shipped pick.

## The second fix failed by one build

Looking at the same data afterwards, a grid of 0, 1.5, 2.5, 3, 4, 5, 6, 7 and
8 ms did best: 196 builds within 0.5 ms and 9 large misses, against 185 and
16. Because it was chosen on those sets, it couldn't ship on them. It went to
a fresh simulated set, M, with a new wheel lag and seed and contact times
packed under 3 ms where the grid can change anything. The rule was committed
before the capture.

| | shipped grid | candidate |
| --- | --- | --- |
| within 0.5 ms (of 66) | 41 | 48 |
| off by more than 1 ms | 11 | 3 |
| mean absolute error | 0.52 ms | 0.37 ms |
| instant builds read off 0 | 0 | 1 |

Three of the four clauses held. The fourth said no instant-contact build may
read more than 0.5 ms off zero, and one did: it read 0.8 ms, which rounds to
1.0. Its residual share was 0.99, so the Pi would never have advised a
re-flash on it. But the rule was written on the reading, not on the advice,
so the grid that ships is unchanged.

Rewriting the clause now and calling M a pass would be the forking path the
rule exists to prevent. The next run gets a fresh set, with the clause
written on what the Pi actually does (no instant build advised) before any
capture.

## Also fixed

The script that scores stored captures had printed only its header since
this morning's grid change, because old captures carry seven candidates and
the grid now has eight. It now rebuilds the board's row from the dense
refits when the lengths differ.

Everything here is simulated, with an assumed half-sine contact. Nobody has
measured how long a real ball stays on a real wheel. The script, the cached
curves and both commit-ordered predictions are in
`ventures/open-tennis-robots/eval/take-short-2026-11-19.md`.
