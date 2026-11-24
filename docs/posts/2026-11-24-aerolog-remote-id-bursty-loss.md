---
title: "Bursty Remote ID loss and the drone transit hold: burst length, not loss rate, is the number to bound"
seo_title: "Bursty Remote ID message loss and drone transit holds"
date: 2026-11-24
tags: [research, uav, airspace, safety, remote-id]
description: "With bursty Remote ID loss, a drone's hold-until-clear rule at 1 m/s speed accuracy stays under 1 s per flight until shadows average 32 to 56 s."
---

The [previous step](2026-11-24-aerolog-remote-id-stale-tracks.md) of the
[`aerolog-scaling`](../../research/aerolog-scaling/) programme priced a
hold-until-clear rule for delivery drones when the traffic picture comes from
broadcast Remote ID. A waiting drone dead-reckons each intruder from its newest
message, so its error grows with that message's age. With losses drawn
independently, the answer was that the speed accuracy field matters most. If the
broadcast reports speed to better than 1 m/s, the rule holds a drone for under
0.16 s per flight even with 90% of messages lost.

In a city, though, messages are not lost one at a time. A building between
receiver and transmitter blocks every message until the intruder comes out from
behind it. At the same mean loss rate, bursts leave the newest message much
older. This run asked how long the bursts can be before the rule stops working.

## The model

Gilbert's two-state channel: in the bad state every message is lost, in the good
state none is. Two numbers set it, the share of messages lost q and the mean
burst length B. Because the chain is reversible, the number of lost messages
since the newest received one has a closed form: none with probability 1 - q, and
k with probability q (1 - 1/B)^(k-1) / B. Independent loss is the special case
B = 1 / (1 - q).

We found no measured burst-length data for Remote ID reception, so B is swept
over 3, 10, 30 and 100 s. For scale only, a building 100 to 300 m deep hides a
12 m/s drone for 8 to 25 s. The loss rates are anchored on a Taipei study of
Bluetooth Remote ID reception (about 12% lost with coding in the more blocked
district, about 50% uncoded in the less blocked one).

No layout had to be recomputed. With one protection radius, the hold at a given
radius depends only on the traffic geometry, which the previous step had stored
per layout. Only the radius that meets 1e-7 collisions per flight hour changes,
and checking it against the stored holds took about six minutes on one core.

## What came out

On the same 48 New York layouts, with speed accuracy better than 1 m/s and half
the messages lost:

| mean burst | radius for 1e-7 (12 / 16 operators) | hold per flight |
|---|---|---|
| independent (2 s) | 76.2 / 76 m | 0.072 / 0.065 s |
| 10 s | 98.8 / 98.4 m | 0.133 / 0.116 s |
| 30 s | 201 / 200 m | 0.773 / 0.635 s |
| 100 s | 584 / 580 m | 14.1 / 11.1 s |

The median hold first passes 1 s per flight once bursts average 32 to 56 s at
better than 1 m/s, or 126 to 224 s at better than 0.3 m/s. Burst length is what
moves the cost. Going from 3 s to 30 s bursts multiplies the hold about 10
times, while going from 50% to 90% loss at 30 s bursts multiplies it 1.3 times.
At better than 3 m/s, even 10 s bursts cost over 3 s per flight. At ten times
today's demand, 30 s bursts at 1 m/s cost 8 to 12 s per flight.

## Our predictions were too pessimistic

We wrote six predictions down and pushed them before computing anything, and
only two held. We expected 10 s bursts to more than double the hold, but it went
up 1.8 times. We expected 30 s bursts to need more than 200 m, and they needed
200 to 201 m. We expected the best speed band to stay within twice the
shared-intent hold up to 30 s bursts, and it went to 2.2 times, which is still
under 0.07 s per flight. The two that held were that burst length matters more
than loss rate, and that coded reception with 10 s bursts stays under 0.1 s per
flight.

## What it means

The previous step's recommendation was to report speed to better than 1 m/s. It
holds with no extra requirement for bursts that average up to about 10 s. Past
that, the quantity to bound is the time since each track's last message: either
a maximum track age, after which the receiver treats the intruder as unknown, or
receiver coverage that keeps shadows short. A reception-rate requirement does not
do the job.

Limits: one city with synthetic operators, as in every step of this strand; a
geometric burst law, while measured blockage is often heavier-tailed, which
would lower these thresholds; swept rather than measured burst lengths; and the
fixed-radius rule only. The results are preliminary. Results file:
[`burst_loss_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/burst_loss_results.txt);
code: [`burst_loss.py`](../../research/aerolog-scaling/experiments/hub_airspace/burst_loss.py).
