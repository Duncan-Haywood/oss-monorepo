---
title: "Drone layers: a hold-until-clear rule meets the collision target for 0.03 s a flight"
seo_title: "Drone climb and descent collision risk: the cost of holding"
date: 2026-11-24
tags: [research, uav, airspace, safety]
description: "A gap-acceptance rule for drone climbs and descents on Remote ID-grade data meets 1e-7 collisions per flight hour for about 0.03 s of hold per flight."
---

The last [`aerolog-scaling`](../../research/aerolog-scaling/) run found where the
collision risk sits in a stack of delivery-drone altitude layers. It is not
between the layers. At the cost-optimal spacing, two drones one layer apart
collide about 1e-17 times per flight hour. The risk is in the climbs and
descents: a drone leaving its hub or dropping to an address passes through every
lower layer, and other operators' drones cruise through those points. That
comes to about 1.7e-4 collisions per flight hour, more than a thousand times the
1e-7 target used in UTM studies.

That leaves two ways to meet the target. One is to fly a single layer, so
nobody crosses anybody else's layer. The other is a procedure for the crossings.
This run priced the procedure.

## The rule

Before it climbs or descends, a drone checks the reported positions of drones in
the layers below it. It waits until none of them is predicted within a radius r
of its column during the seconds it will spend in their layer, then flies the
whole transit without stopping. Road engineers know this as gap acceptance: a
pedestrian waiting for a gap in traffic.

Launches are random (Poisson) and legs are straight, so the drones entering a
disc around any point also arrive as a Poisson stream. A Poisson stream shifted
in time is still Poisson, so the check over every crossed layer reduces to
waiting for one empty window. The mean wait for that has a closed form, Adams'
1936 delay formula. We computed it at every transit point of 48 New York layouts
(12 and 16 operators, 240 flights an hour), using the same exact traffic flux
the rest of the programme uses, at radii from 1.43 m to 80 m.

The radius depends on how well each drone knows where the others are. A
collision still happens if a drone that is really in the way was reported more
than r minus the airframe span away. We took three grades of position error:
RTK on both drones, plain GNSS, and the Remote ID rule's floor (the reported
position within 100 ft of the true one 95% of the time, 14 CFR 89.310).

## What it found

Four of six predictions, pushed before any layout was built, held.

- **Remote ID-grade data is enough.** To reach 1e-7 the rule needs a radius of
  about 50 m (62 m for the 2.5e-9 crewed-aviation figure). At that radius the
  mean hold is **0.026 to 0.030 s per flight**. Only about one transit in 500
  waits at all. With GNSS-grade data the radius drops to 9.6 m, with RTK to 2 m.
- **It is far cheaper than one layer.** Flying everyone in a single layer meets
  the target too, but costs 4.2 times the losses of separation of the
  cost-optimal stack.
- **It holds up at ten times the traffic:** 0.27 to 0.31 s per flight.
- **It stops scaling somewhere between 30 and 100 times the traffic.** At 30
  times the median hold is about a second, but the worst layout's is 18 s. At
  100 times the holds run to minutes or longer. The cause is points near other
  operators' hubs, where a 50 m disc catches every leg that hub flies.

Two results changed the rule itself.

- **The vertical window has to cover the separation minimum, not just the
  airframe.** If a drone only checks the 0.43 m slab its own body occupies, no
  radius meets the target, because the other drone's altitude error is not
  covered. With a 25 ft window the vertical miss chance is about 6e-6.
- **Don't hold inside an occupied layer.** One prediction said that hovering in
  its own layer while waiting to descend would be safe. It was not: unprotected,
  that hover carries up to 3e-7 collisions per flight hour in the worst layout,
  above the target. The wait has to be flown between layers or kept clear the
  same way.

## Limits

This is a model. It has straight legs, no wind, one city and synthetic
operators. It knows each drone's intent exactly apart from a Gaussian position
error, and it has no message loss. The plan was held fixed as traffic grew. The
DJI accuracy figures come from reseller sheets that do not state which statistic
"±" is. The results are preliminary. The full method and numbers are in the
project's [research log](../../research/aerolog-scaling/LOG.md) and Section 6.11
of the paper draft.
