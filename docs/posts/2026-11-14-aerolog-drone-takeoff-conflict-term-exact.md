---
title: "The drone take-off conflict term has a closed form, and it doesn't care about altitude layers"
seo_title: "Drone take-off conflict term: exact from hub sites and delivery maps"
date: 2026-11-14
tags: [research, uav, airspace, geometric-probability]
description: "Drone conflicts that begin at take-off or turnaround, computed exactly from hub sites and delivery lists: layer-blind, scaling as πR², 60% at delivery points."
---

The previous `aerolog-scaling` step found why a crossing-path formula
undercounts conflicts between delivery drones from different operators by
about 7%. The formula counts paths that cross into the separation disc while
both drones are flying. It misses the conflicts that *begin* inside the disc,
because a drone takes off from its hub, or turns for home at a delivery point,
right next to another operator's drone. That step estimated the missing "start
term" by sampling pairs of flights. This step computes it exactly.

**Why no pairs are needed.** Under the semicircular rule a flight's outbound
leg and its return leg follow the same segment at the same speed, in opposite
altitude layers. So wherever a drone starts, and in whichever layer, exactly
one leg of any other flight is in that layer, and it spends the same time near
the start point either way. The start term does not depend on layers. It
factorises into one operator's expected airborne time within *R* of another
operator's hub and delivery points. That is a finite sum over a destination
list, evaluated by visiting only the legs whose bearing passes within *R*.

**On 24 eight-operator layouts over New York** (2014 pickup locations standing
in for deliveries, *R* = 50 m, 240 flights an hour), five of the six
pre-registered predictions held:

- the exact term matches the sampled one (pooled ratio 1.0002; 23 of 24 layouts
  within three standard errors);
- 60% of it comes from drones turning for home at delivery points inside
  another operator's traffic, and 40% from hub launches under another
  operator's routes. Points that two operators both serve add 0.6%;
- it grows as πR². It is 3.93 times larger at 100 m than at 50 m, and 0.257 times
  as large at 25 m;
- added to the crossing-path formula, it brings the formula within 2% of the
  exact estimator in all 24 layouts (mean 1.0025), and it picks the same
  altitude-layer split in 23 (the 24th is a tie).

**The prediction that failed:** I expected an exact start term to make the
whole estimate less noisy. It doesn't (median spread ratio 1.02). The sampled
start chords share flight pairs with the exact count, so their noise partly
cancels in the ratio, and the crossing term's own noise dominates anyway. The
stdlib implementation is also about five times slower than simply sampling.

**What a planner can take from it:** the correction depends only on where hubs
are, where each operator delivers, and how fast its drones fly. It is the same
whatever layer plan you are comparing, and you can scale it by *R*² when you
change the separation minimum. The model has straight legs, Poisson launches,
no avoidance and no wind, and covers one city. Code, tests and results:
[`research/aerolog-scaling`](../../research/aerolog-scaling/README.md),
milestone 11t.
