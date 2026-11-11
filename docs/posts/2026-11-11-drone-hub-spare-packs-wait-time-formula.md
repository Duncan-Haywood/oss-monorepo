---
title: "Sizing a drone hub's spare batteries to a waiting-time target, without a simulator"
seo_title: "Drone hub spare battery packs: a p95 waiting-time formula"
date: 2026-11-11
tags: [research, uav, logistics, queueing]
description: "Two short stdlib calculations reproduce a hub simulator's spare-pack count for p95 wait under 300 s, matching it or over-providing by at most 2 packs (5%)."
---

The `aerolog-scaling` programme has a delivery-hub model: 8 pads, 8
chargers, a 42-minute charge for each swapped pack. A planner wants to know
how many spare packs keep the 95th-percentile wait for a charged pack under
5 minutes. Earlier steps answered that with a discrete-event simulator. This
morning's step showed that the share of orders that wait at all can be
computed in closed form. This step extends it to the whole waiting-time
distribution.

The idea fits in two lines. A deterministic charge time means packs come off
the chargers in the order they went on, so the pool is used in a fixed cycle:
order *n* gets the pack that order *n − S* brought back. Its wait is that
pack's charger delay, plus pad and charge time, minus the time between the two
orders. The charger delay of a FIFO M^X/D/c queue follows a Lindley
recursion with Erlang gaps. Each step is "shift, subtract an exponential,
clip at zero", which costs O(grid) in pure Python.

Smallest spare-pack count for p95 wait ≤ 300 s (orders in batches of *k*):

| Load | k = 1 | k = 2 | k = 4 | k = 8 |
|---|---|---|---|---|
| 70% of charger limit, formula / simulator | 11 / 11 | 15 / 15 | 24 / 24 | 41 / 39 |
| 85% of charger limit, formula / simulator | 16 / 16 | 25 / 24 | 44 / 42 | 81 / 79 |

I predicted the formula would be optimistic, because it ignores the way a late
flight returns its pack late. Close to the mean pack count it is optimistic.
In the region a design actually uses it is slightly conservative: up to 0.009
too high in the probability of waiting over 5 minutes, which means at most 2
extra packs. I have not settled why the sign flips there.

One side finding: the earlier simulator study reported 48 packs for batches
of 8 at 70% load. That came from a coarse grid that jumped from 40 to 48. On
a 1-pack grid the simulator needs 39.

Limits: no pad waits or feedback in the formula, a fixed charge time, batch
sizes that divide the charger count, and stationary demand. The batch sizes
are swept, not measured. Code and results:
`research/aerolog-scaling/experiments/hub_throughput/analytic_wait_tail.py`.
AI-assisted research; preliminary.
