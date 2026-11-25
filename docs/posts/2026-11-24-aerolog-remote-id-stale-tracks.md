---
title: "Stale Remote ID tracks and the drone transit hold: speed accuracy matters more than lost messages"
seo_title: "Remote ID message loss vs speed accuracy for drone holds"
date: 2026-11-24
tags: [research, uav, airspace, safety, remote-id]
description: "A drone's hold-until-clear rule survives broadcast Remote ID with 90% of messages lost if speed is reported to 1 m/s; at 3 m/s it stops scaling."
---

Earlier today the [`aerolog-scaling`](../../research/aerolog-scaling/) programme
[priced a hold-until-clear rule](2026-11-24-aerolog-drone-transit-hold-rule.md)
for delivery drones that climb and descend through other operators' altitude
layers, and then [worked out where to hover](2026-11-24-aerolog-drone-hold-between-layers.md)
while waiting. On 48 New York layouts the rule meets a target of 1e-7 collisions
per flight hour for about 0.03 s of waiting per flight.

Both runs assumed that a waiting drone knows where the traffic around it is
going: straight legs at a known speed, with only a position error on top. That
is network surveillance with shared flight intent. Broadcast Remote ID gives
less. A receiver hears each nearby drone's position and velocity about once a
second, misses some of those messages, and has to dead-reckon from the newest
one it got. This run asked how much that costs.

## What gets older, and by how much

The US rules (14 CFR 89.310 and 89.320) require at least one message per second
and at most 1 s from measurement to broadcast. The position error then grows
with the message's age, times the error in the broadcast velocity, plus the time
until the intruder is actually near the transit point. For a full climb or
descent through the 120 m column that is up to 27 s, so a velocity error of
1 m/s already moves a prediction by tens of metres.

We swept three things:

- **Message loss**, independent per message: none, half, three quarters and 90%.
  A Taiwanese study of Bluetooth Remote ID in two urban districts measured 26%
  and 51% of messages received without extra coding.
- **Speed accuracy**, the 95% bands of the ASTM F3411 location message: better
  than 0.3, 1 and 3 m/s.
- **Position accuracy**: the Remote ID bound of 100 ft at 95%, or GNSS grade.

For each case we found the protection radius that still meets 1e-7, then
recomputed the hold at that radius on the same 48 layouts, points and plans.

## What came out

Median hold per flight, 12 operators, Remote ID position bound:

| Speed accuracy | No loss | Half lost | 90% lost | Half lost, 10x demand |
|---|---|---|---|---|
| Intent known (earlier run) | 0.030 s at 50 m | | | 0.31 s |
| < 0.3 m/s | 0.032 s at 52 m | 0.032 s | 0.035 s | 0.34 s |
| < 1 m/s | 0.068 s at 74.5 m | 0.072 s at 76 m | 0.156 s at 106 m | 0.77 s |
| < 3 m/s | 1.13 s at 234 m | 1.24 s at 243 m | 4.31 s at 384 m | 24.5 s |

The message rate and the latency barely matter: at 0.3 m/s the radius grows by
2 m. Losing messages matters a little: even with 90% lost the hold at 1 m/s is
about twice its no-loss value. The speed accuracy is what sets the cost. Going
from 1 to 3 m/s multiplies the hold by 16 to 17. At ten times the modelled
demand, a 3 m/s broadcast needs 16 to 38 s of waiting per flight in the median
layout, and hundreds of seconds with heavy loss. At that point the rule no longer
works.

A more accurate position does not help much. With GNSS-grade positions the
3 m/s case still needs 225 to 381 m. We also tried a smarter receiver that gives
each track its own radius according to its age. It made almost no difference up
to 75% loss, and only cut the hold by about a third at 90%.

## Predictions

Six predictions were committed before any layout was built, and four held. The
two that failed both said that being clever would pay more than it did. We
expected a 3 m/s broadcast with three quarters of messages lost to need over
10 s per flight at today's demand. It needed 1.3 to 1.6 s, and it only reaches
tens of seconds at ten times the demand. We also expected age-scaled radii to
cut the hold by a factor of three. They did not.

## What it means

To use a hold rule like this on broadcast Remote ID, the requirement worth
writing down is that drones report speed to better than 1 m/s. Message rate and
reception rate matter much less. This is still a model: one city, synthetic
operators, losses treated as independent when real urban blockage comes in
bursts, and a horizon bound that assumes every transit crosses the whole column.
It also leaves out a gap. A drone that launches inside the prediction horizon
has no track yet, and that is likely to matter most near hubs. That is the next
step.

Code and results: [`stale_track.py`](../../research/aerolog-scaling/experiments/hub_airspace/stale_track.py),
[`stale_track_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/stale_track_results.txt);
the paper section is 6.10(d) of
[`airspace_layers.md`](../../research/aerolog-scaling/paper/airspace_layers.md).
