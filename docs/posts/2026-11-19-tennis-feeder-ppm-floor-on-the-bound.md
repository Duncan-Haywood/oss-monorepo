---
title: "The tennis feeder's honest bound gets a 2 ppm floor, and a fresh test says it now covers every build"
seo_title: "Tennis feeder: a 2 ppm floor on the contact-time bound"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Whole-ppm rounding made the feeder's contact-time bound too tight on quiet tachs. A 2 ppm floor, set before a fresh test, covered 48 of 48 builds."
---

When the open tennis-ball feeder's survey can't tell a short ball contact
from an instant one, the Pi now says so: "these balls cannot tell an instant
take from one up to X ms". X is the first contact time on the board's grid
whose summed misfit is more than 2% worse than the instant fit.

That bound [passed its first held-out test](2026-11-19-tennis-feeder-short-contacts-no-ball-saw-them.md)
by a single build. Both of the builds it missed had the same cause. The
board sends its misfits in whole parts per million, and on the quietest tach
the instant fit was only 16 to 19 ppm. There, one ppm of rounding is 5 to
6%, so a candidate could clear the 2% bar on rounding alone, and the bound
came out shorter than the true contact.

## The fix, chosen before the test

The candidate rule: a contact time counts as worse only when it is more
than 2% *and* at least N ppm over the instant fit. On the data already seen,
a 1 ppm floor fixed one of the two misses, and 2 ppm fixed both. The cost
was a looser bound on 3 of 30 instant builds (they read "up to 2.5 ms" or
more where they had read 1.5 ms).

Before a new simulated set was captured, this was written down and
committed: the 2 ppm floor ships only if, on the fresh set, it keeps the
true contact inside the bound on at least 95% of the builds told to keep
`TAKE_US = 0`, does no worse than 2% alone, and still says 1.5 ms on at
least half the instant builds.

## Set P

A new wheel lag and random seed, 66 drills, the board's own survey frames:

| | 2% alone | 2% and 2 ppm |
| --- | --- | --- |
| true contact within the bound | 46 of 48 | 48 of 48 |
| instant builds bounded at 1.5 ms | 4 of 6 | 4 of 6 |

Both conditions held, so the floor is now in the Pi's code. The 2% rule
alone would have scraped through again by one build, with the same kind of
miss: a 1.6 ms and a 2.8 ms contact each told "up to 1.5 ms" on a quiet
tach. The floor moved five bounds on P, all upward, none down. On noisier
tachs, where 2% is already more than 2 ppm, nothing changes.

## What it is not

All of this is simulated, with one seed per test. The floor makes the line
honest about rounding. It does not make the survey see contacts it can't
see: with one tach pulse a wheel revolution, a contact shorter than a
revolution shows only on balls whose contact crosses a revolution's edge.
More pulses a revolution is the real fix, and it isn't built yet.

The numbers, the rule's commit and the commands are in
`ventures/open-tennis-robots/eval/take-bound-floor-p-2026-11-19.md`.
