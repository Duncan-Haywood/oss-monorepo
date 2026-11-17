---
title: "Sizing a drone hub's spare batteries for a real day of demand, without a simulator"
seo_title: "Drone hub spare battery count under daily demand: an exact formula"
date: 2026-11-11
tags: [research, uav, logistics, queueing]
description: "An exact time-varying queueing rule gives the spare-pack count for a cargo-drone hub whose demand peak exceeds its chargers, within 1 pack of simulation."
---

The `aerolog-scaling` programme has a hub question running through it: how
many spare battery packs does a cargo-drone hub need so that 95% of orders
wait at most 5 minutes for a charged pack? The hub in these runs has 8 pads,
8 chargers and a 42-minute charge. Two earlier steps replaced the
simulator with formulas, but only for a constant order rate. Real demand has a
daily shape. In the shape used here (City of Chicago ride-hail trips per 15
minutes, used only as a stand-in for an on-demand service's day), the busiest
quarter-hour is 1.76 times the daily mean. That is above what the chargers can
turn round, so the usual stationary formulas have no answer at the peak.

The fix turned out to be a short argument. Charging is first-in, first-out
with a fixed charge time, so packs come back in the order their flights left.
An order therefore waits more than *w* seconds exactly when at least *S* packs
from earlier orders are still not ready *w* seconds later. That count splits
into two independent pieces. One is every order in a recent window, whose
packs cannot be ready yet. The other is the packs still queued at the chargers
one charge time earlier, minus the charger count. The queue at the chargers
follows a simple recursion that works for any rate profile. So the whole
waiting-time tail comes from a few convolutions of Poisson counts. It needs no
simulation and no steady state.

Smallest spare-pack count for p95 wait of 5 minutes or less (4 days, 1-pack
grid; the simulator runs 2,000 to 4,000 seeds):

| Mean load | Orders | Rule | Simulator | Constant-rate formula |
|---|---|---|---|---|
| 70% | single, Wed / Sat | 23 / 24 | 23 / 24 | 11 |
| 85% | single, Wed / Sat | 43 / 45 | 43 / 45 | 16 |
| 70% | batches of 4 | 40 / 42 | 41 / 43 | 24 |
| 85% | batches of 4 | 67 / 68 | 68 / 68 | 44 |

Three things I did not expect:

- **The constant-rate count is badly short.** A daily peak doubles or triples
  the pool at these loads.
- **Waits trail the peak by hours.** At 85% load the evening order peak is at
  18:00, but the share of orders waiting over 5 minutes peaks at 22:00 (about
  21%). The morning peak is also above the charger limit, yet it causes almost
  no waiting, because the overnight lull refilled every pack.
- **My own earlier simulation was optimistic.** An earlier step's arrival
  generator rounded each quarter-hour's order count to a whole number, which is
  less variable than real arrivals. It needed 9 to 12 fewer packs than Poisson
  orders with the same shape. How variable demand is within each quarter-hour
  matters as much as its shape.

One more lesson, about method. The first run used 100 simulator seeds and made
the rule look 3 to 7 packs optimistic for batches of 4. A paired diagnostic
showed that the effects the rule leaves out (late returns, the pad limit)
changed nothing. The gap was seed noise: with batches, a 4-day hub run is
noisy enough to need thousands of seeds. With 4,000 the gap closed to 1 pack.
A small residual (about 0.003 in the waiting share) remains for batches and is
not explained yet.

Limits: the demand shape is ride-hail, not delivery orders. Counts within
each quarter-hour are taken as Poisson, and real ones are probably more
variable, which would raise the counts. Charge time is fixed, and batch sizes
are swept, not measured. Code, results and the figure are in
`research/aerolog-scaling/experiments/hub_throughput/` (`analytic_trace_tail.py`).
AI-assisted research; preliminary.
