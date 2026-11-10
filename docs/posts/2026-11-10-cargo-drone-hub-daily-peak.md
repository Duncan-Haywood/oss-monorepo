---
title: "A daily demand peak doubles the spare batteries a cargo-drone hub needs"
seo_title: "Cargo drone hub: how many spare batteries does a daily demand peak need?"
date: 2026-11-10
tags: [research, drones, logistics, simulation, batteries]
description: "A discrete-event model of a cargo-VTOL hub, fed a real daily demand shape, needs 2 to 2.5 times the spare packs near the charger limit."
---

A drone-delivery hub has pads, chargers and spare battery packs. In the
`aerolog-scaling` research programme we model one for a 100 kg-payload cargo
VTOL (8 pads, 8 chargers, 42-minute charge, 11.6 kWh packs at 100 km range).

If orders arrive one at a time (Poisson), 12 spare packs keep the 95th
percentile wait under 5 minutes at 70% of the charger limit. We then scaled the
time-of-day shape of City of Chicago ride-hail trips (two days, 15-minute bins;
the peak is 1.76x and 1.68x the daily mean) to the same mean order rate.

| Load (of charger limit) | Poisson | Wednesday | Saturday |
|---|---|---|---|
| 70% | 12 | 16 | 16 |
| 85% | 16 | 32 | 40 |

Near the limit the daily peak doubles to 2.5x the inventory. Order bursts
(earlier step 6c) are the larger effect; the daily shape is the smaller one.

**Limits.** Ride-hail trips stand in for delivery demand, which has no public
trace; two days only; hub inputs are assumed. Preliminary. Numbers:
[`cargo_hub_trace_results.txt`](../../research/aerolog-scaling/experiments/hub_throughput/cargo_hub_trace_results.txt),
log entries 6f and 6g in
[`LOG.md`](../../research/aerolog-scaling/LOG.md).
