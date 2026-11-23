---
title: "Drone altitude layers: the collision risk is in the climbs, not the spacing"
seo_title: "Drone altitude layers: collision risk per flight hour"
date: 2026-11-23
tags: [research, uav, airspace, safety]
description: "A Reich-style collision term on 48 New York drone layouts: cross-level risk is about 1e-17 per flight hour, while climbs and descents run about 1.7e-4."
---

[`aerolog-scaling`](../../research/aerolog-scaling/) has been working out how far
apart delivery-drone altitude layers should be under the 400 ft ceiling. Its
answer so far is 5 two-level bands about 13.3 m apart, not 8 at 25 ft. The
planner gets there by minimising *losses of separation*: two drones within 50 m
horizontally and 25 ft vertically. Those are events a tactical system has to
resolve. They are not collisions.

Crewed aviation sizes vertical separation another way. The collision risk model
of Reich (1966) multiplies the chance that two aircraft one level apart overlap
vertically by the rate at which they overlap horizontally, and the product has to
stay under a target level of safety. The paper draft had promised that "a
collision target would enter as a constraint on top". This run computed it.

## What was computed

A collision is two drone centres within 1.43 m of each other horizontally and
0.43 m vertically. Those are a DJI Matrice 300 RTK's span (895 mm wheelbase plus
one propeller) and its height; a 1 m height was run as a sensitivity. The exact
closed forms behind the cost model were rebuilt at that size for all 48 New York
layouts. They could not simply be scaled down from 50 m, because an outbound and
a return leg of the same route are collinear and meet head-on at any radius.

The rates were checked against two targets: 1e-7 collisions per flight hour, the
mid-air figure Wang, Deng and Low (2023) use for UTM separation, and 2.5e-9, the
figure quoted for crewed aircraft in reduced vertical separation airspace. Six
predictions were pushed before any layout was built at drone size.

## What it found

**The spacing is safe.** At the cost-optimal 5 bands, the cross-level collision
rate is about 1e-17 per flight hour with the sourced Gaussian altitude error,
ten orders of magnitude inside either target. A target on that term alone would
allow 7 to 9 bands, more than the cost model wants. Under the same error, the
literature's 8 bands at 25 ft carry 3.3e-8 to 4.0e-8: inside 1e-7, outside
2.5e-9.

**The margin depends on the tail.** With a Laplace error of the same spread, the
5-band stack carries about 3e-8, and the 2.5e-9 target cuts it to 4 bands in
every layout. Seven RTK flights cannot tell a Gaussian from a Laplace tail nine
standard deviations out.

**Uncalibrated offsets break it.** At the measured airframe static-pressure
offsets, a plan that ignores them stays under 1e-7 in 0 and 7 of 96 draws.
At twice the offset it breaks 1e-7 in 88 and 90 of 96 draws.

**The climbs are the problem.** A drone climbing out of its hub or descending
to an address passes through every level below its own, and other operators'
drones cruise there. That term comes to a median **1.7e-4 collisions per flight
hour**, over 1,000 times the 1e-7 target. It is almost the same at 2 bands as at
8, because a climb passes through each level's altitude however well the drones
hold height. Only a single band, which has no transits, meets the target. Even
with hub climbs only (a winch or tether delivery that never descends at the
address), it is about 4e-5.

A rough hand check gives the same order. Legs pass within 1.43 m of a given
point about 0.02 times an hour, a transit spends about a third of a second in
each level, and each flight makes four transits.

Two of the six predictions failed. "A 1e-7 target never binds" was refuted by
the transit term, and the measured offsets broke 1e-7 in fewer draws than
predicted.

## What it means

Spacing chosen to minimise losses of separation already protects against
cross-level collisions, as long as the altitude error is roughly Gaussian and
the offsets are calibrated. A collision target therefore isn't a spacing
question. The places to meet it are climb and descent procedures: corridors at
hubs, sequencing, descending only into empty levels, detect and avoid.

These are unmitigated rates, with no avoidance of any kind, as in Reich's model.
Contact is modelled as a box, not the airframe's shape. The model has no lateral
path error, and it covers one city's 48 synthetic operator layouts. All of it is
preliminary. One change came after the predictions were pushed and is disclosed:
the New York destinations turned out to be rounded to a 10 m grid, which at drone
size counts coincident points as hits, so each point was spread over its cell
and the build was rerun.

Paper section 6.10 in
[`airspace_layers.md`](../../research/aerolog-scaling/paper/airspace_layers.md);
results in
[`collision_target_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/collision_target_results.txt).
