---
title: "Where a delivery drone should hover while it waits to descend: half a layer off, on the emptier side"
seo_title: "Drone descent holds: hover between altitude layers"
date: 2026-11-24
tags: [research, uav, airspace, safety]
description: "Hovering a descent hold half a layer from the drone's own level cuts its collision risk from 1.6e-7 to under 6e-10 per flight hour, at almost no cost."
---

The previous [`aerolog-scaling`](../../research/aerolog-scaling/) run
[priced a hold-until-clear rule](2026-11-24-aerolog-drone-transit-hold-rule.md)
for drones that climb and descend through other operators' altitude layers. A
drone waits until the reported traffic below it is clear, then flies the whole
transit. At the modelled New York demand it meets a 1e-7 collision target for
about 0.03 s of waiting per flight.

The same run left one thing open. A drone waiting to descend has to hover
somewhere, and hovering inside its own layer was risky. Other drones in that
layer fly straight through the hover point. With no avoidance, that came to up
to 3e-7 collisions per flight hour, over the target in some layouts. The rule
it added was "hold outside the occupied levels", but nobody had priced that.
This run did.

## Four places to wait

Each band in the stack has two levels, one per heading (east or west). Every
delivery leg has a return leg on the other heading, so at any point an
operator's traffic splits exactly half and half between its two levels. We
compared four hover positions for a descending drone:

- **H0:** its own level, as before;
- **HB:** half a level below (6.7 m at the cost-optimal 5 bands);
- **HA:** half a level above, falling back to below from the top level, since
  above it would leave the 400 ft column;
- **HX:** whichever of HB and HA is emptier at that point.

For each we counted two things, using the same 48 layouts, transit points and
plans as the last run. One was collisions, meaning centres within the DJI M300's
1.43 m span and 0.43 m height. The other was losses of separation, meaning
within 50 m and 25 ft, which is the cost the layer planner minimises. Altitude
error is the sourced Gaussian (sd 1.59 m for the gap between two drones), plus a
Laplace of the same sd as a heavy tail.

## What came out

| Hover position | Collisions per flight hour (median, 12 / 16 operators) | Worst layout |
|---|---|---|
| Own level (H0) | 2.1e-8 / 4.2e-8 | 1.6e-7 |
| Always below (HB) | 7.0e-11 / 6.3e-11 | 1.2e-9 |
| Always above (HA) | 2.3e-11 / 2.6e-11 | 1.1e-9 |
| Emptier side (HX) | 6.9e-12 / 1.4e-11 | 5.7e-10 |

Holding between levels on the emptier side takes the hover's collision term down
by about three orders of magnitude. The cost, in losses of separation, goes up
by 34 to 37%. Half a level sits inside the 25 ft minimum of two levels instead
of one. That cost starts very small, though: hovering's losses of separation
are a median under 1e-4 of the plan's own. Choosing the side point by point
matters. Always holding below gives 4 to 10 times the collisions of the best
side.

It is not free everywhere. At ten times the modelled demand the worst layout's
between-level hold reaches 6e-8 under the Gaussian error and 2.7e-7 under the
heavy tail. At that density the hover needs the same protection as the transit.
Five of the six pre-registered predictions held. The one that failed predicted
under 1e-9 at ten times the demand.

## A correction

Rebuilding the old figure per heading showed that the previous run had counted
twice. It charged all of a same-band operator's traffic at the hovering drone's
level, when half of it flies one level away. The corrected own-level figure is
half the old one: at most 1.57e-7, not 3.04e-7. It is still over the target in
some layouts, so the old conclusion stands, and the paper now gives both
numbers.

## Limits

These numbers come from one city, synthetic operators, straight legs, no wind
and no avoidance while hovering. The stream of drones that triggers the hold and
the stream the hover is exposed to are treated as independent, and the plan
stays fixed as traffic grows. Everything is preliminary. Code, results and the
pre-registered predictions are in
[`experiments/hub_airspace/hold_level.py`](../../research/aerolog-scaling/experiments/hub_airspace/hold_level.py)
and [`hold_level_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/hold_level_results.txt).
