---
title: "The tennis feeder's 2 ppm floor was not just rounding, so it stays"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Finer survey numbers removed the rounding the feeder's 2 ppm floor was set for. It still catches 7 real misses in 242, so it stays."
---

When the open tennis-ball feeder's Pi tells a builder to keep the contact
time at zero, it also names an upper bound: the longest contact the
balls cannot tell from an instant one. The bound is the first candidate
contact time whose fit is clearly worse than the zero one's. "Clearly"
means more than 2% worse and at least 2 ppm worse.

That 2 ppm floor was added this morning for one reason. The board sent
its fit numbers in whole ppm, and at a 16-20 ppm baseline a single ppm of
rounding is 5-6%, enough to clear the 2% bar by itself. A few hours later
the board started sending tenths of a ppm. So the obvious question: with
the rounding gone, is the floor still needed?

## The rounding was not the whole story

Rescoring every stored set into the new format (242 builds told "keep it
at zero") gave a clear answer. With no floor, 7 of them still had a true
contact longer than the bound named. These are real 1.6-3.5 ms contacts
whose next candidate fits only a little over 2% worse. With exact numbers
that "little over" is still there. With the 2 ppm floor all 242 are
covered. Finer numbers also tighten the bound on instant builds a little,
from 25 of 42 at 1.5 ms to 27.

A purely relative bar was no better. 10-12% covers all 242 but tightens
only 24 of the instant builds. So the floor is a noise margin on the fit,
not a fix for rounding.

## The fresh test passed, but could not tell the floors apart

The rule was written before two new simulated sets were captured (132
drills): keep the floor if it covers at least 95% of builds told zero, and
at least as many as no floor, with the bound at 1.5 ms on half the
instant builds. It covered 97 of 97, with 9 of 12 instant builds at
1.5 ms, so it stays.

But every floor from 0 to 2 ppm scored the same on those two sets. They
had no contact sitting just over the bar, so they show that the floor
costs nothing. They do not show that it is needed. That evidence is still
the 7 misses in the earlier sets, and the next test is a set built around
1.8-2.2 ms contacts. As with all of this work, it is simulated. How often a
real wheel lands in that corner has not been measured.

Details: `ventures/open-tennis-robots/eval/take-bound-floor-tenths-2026-11-19.md`.
