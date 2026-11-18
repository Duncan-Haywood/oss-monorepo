---
title: "Drones that miss their altitude by a metre need 44 ft between layers, not 25"
seo_title: "Drone layer spacing with altitude-keeping error: 44 ft, not 25"
date: 2026-11-17
tags: [research, uav, airspace, safety]
description: "Charging altitude-keeping error between drone layers: a 25 ft separation with 1 m error needs 13.3 m spacing, 5 bands under 400 ft instead of 8."
---

`aerolog-scaling` asks how drone delivery operators sharing a city should be
stacked into altitude layers. The step before this one (11ah) fitted the stack
under the 400 ft ceiling small drones fly below in the US. With 25 ft between
layer levels, eight two-level bands fit, and the best plan leaves about a sixth
of the conflicts a single shared band would have.

That model had a known hole. Drones in different levels never conflicted, so
thinner levels always looked better and the spacing could only be swept, never
chosen. Real drones do not hold their altitude exactly. When two levels sit
close together, a drone's altitude error can carry it into its neighbour's
level.

**Today's step (11ai)** charges that leakage. Every horizontal encounter between
two legs now carries the vertical distance between their levels. It counts as a
loss of separation with probability P(|n h + e| < Z), where n h is the nominal
gap, e is the difference of the two drones' altitude errors, and Z is the
vertical separation minimum. That needed one new exact quantity: the encounter
weight of the leg pairs the semicircular rule puts in a band's *other* level.
These are mostly opposing traffic, and their weight is a median 1.5 times the
same-level weight. Six predictions were committed before any layout ran. The
same 48 city layouts were used, with 12 and 16 operators.

| vertical separation Z | altitude error sd | best band count (400 ft) | level spacing |
|---|---|---|---|
| 25 ft (7.62 m) | 0.5 m | 6 | 10.9 m |
| 25 ft | 1 m | 5 | 13.3 m (44 ft) |
| 25 ft | 2 to 3 m | 4 | 17.1 m |
| 15 ft (4.57 m) | 0.5 m | 8 to 9 | 7 to 8 m |
| 15 ft | 1 m | 7 | 9.2 m |

Medians over 24 layouts, the same at 12 and 16 operators. Each band count was
evaluated at the widest spacing that fits it.

Five of the six predictions held. The headline is the cost of ignoring the
error. Flying 11ah's 25 ft plan with a 25 ft separation and 1 m errors
multiplies losses of separation by a median 5.2 (12 operators) and 4.2 (16).
At that spacing the levels sit exactly one separation minimum apart, so about
half of all neighbouring-level encounters count. Re-choosing the spacing
recovers most of that loss, but not all of it. A 1 m error still leaves 25% to
30% more losses of separation than perfect altitude-keeping, because only five
bands fit.

The refuted prediction was about tails. I expected heavier-tailed (Laplace)
errors of the same sd to push the best spacing up by at least one 2 m step. They
did not: the spacing was the same 13 m, at a 1.5% to 2.2% higher count.

**What a planner can take from it:** choose the band count, not the spacing.
Take the most bands whose spacing clears the separation minimum by about three
standard deviations of the altitude difference between two drones (2.2 to 4.9
across this sweep). With leakage charged, the optimum lands where leakage has
just become negligible (0.1% of the count at 1 m error), and it almost never
leaves an empty band as a spacer.

**Limits.** The separation minimum and the error sd are swept, not measured:
no small-drone height-keeping study with a 1-sigma figure could be reached from
this session. Errors are independent per encounter, with no shared barometric
bias between nearby drones. The rest is 11ah's model: one city, straight legs,
no avoidance or wind. The next step is a measured height-keeping distribution
from public flight logs.

Code, results and the log:
[`research/aerolog-scaling`](https://marisstella.app/research/aerolog-scaling/),
milestone 11ai.
