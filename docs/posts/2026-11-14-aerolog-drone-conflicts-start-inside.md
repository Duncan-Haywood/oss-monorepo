---
title: "Why a crossing-path formula undercounts drone conflicts by 7%, and the one term that fixes it"
seo_title: "Drone conflict closed-form bias: Steiner formula and the take-off term"
date: 2026-11-14
tags: [research, uav, airspace, geometric-probability]
description: "A crossing-path formula misses drone conflicts that begin at take-off. Steiner's formula gives the missing πR² term; adding it closes a 7% gap to 0.25%."
---

The `aerolog-scaling` programme estimates how often delivery drones from
several operators come within a separation radius *R* of each other in a
shared layer. Its closed form (milestone 11d) counts pairs of straight legs
whose paths cross and gives each crossing a window of departure offsets,
2R|w| / |v_a × v_b|. The previous step built an exact estimator and found the
formula 7% low on average (3% to 12% across 24 hub layouts), yet with the right
ranking of operator pairs. This step explains why.

**Two ways a conflict can begin.** Two straight legs come within *R* of each
other at most once, because their separation is convex in time. That episode
starts in one of two ways. Either the relative position crosses into the
*R*-disc while both drones fly (flux), or one drone takes off, or leaves a
delivery point for home, already inside the disc (a start). Both parts can be
computed exactly for every pair of legs.

**Steiner's formula settles the average.** Fix the two velocities and
durations and slide leg b over every position. For a fixed launch offset, the
positions that produce a conflict form a segment of length |w|·overlap,
thickened by *R*. Its area is 2R|w|·overlap + πR². Integrating over offsets
gives 2R|w|D_aD_b + πR²(D_a + D_b). The crossing-window formula integrates to
exactly the first term. So the closed form is the flux term, and it leaves out
the πR² start term entirely. Truncation at leg ends and near misses between
paths that don't cross cancel out on average. Relative to the flux term, the
missing piece is (πR / 2|w|)(1/D_a + 1/D_b): it grows linearly with *R* and is
larger for short legs and slow relative speeds.

**On the 24 layouts** (Manhattan pickup locations standing in for
deliveries, 240 flights an hour, 400,000 sampled flight pairs each):

- cross-operator pairs carry 99.5% of the deficit, and the start term accounts
  for 104% of it;
- the deficit is 3.7%, 7.2% and 13.1% at R = 25, 50 and 100 m, as the
  linear-in-*R* prediction says;
- adding the start chords brings the closed form from 0.928 of the exact count
  to 1.0025 (within 2% in all 24 layouts). It picks the same two-layer split as
  before in 23 of 24 layouts and a 0.4% better one in the last.

All six pre-registered predictions held. In practice, a planner using a
crossing-path formula for drone (or any straight-line traffic) conflict rates
should add a πR² term for every take-off and turnaround. At realistic
separation minima it is not a rounding error.

The model has straight legs, Poisson launches, no avoidance and no wind, and
covers one city. Code, tests and results:
[`research/aerolog-scaling`](../../research/aerolog-scaling/README.md),
milestone 11s.
