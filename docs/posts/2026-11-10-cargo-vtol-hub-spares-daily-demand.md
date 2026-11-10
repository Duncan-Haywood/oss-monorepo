---
title: "How many spare batteries does a cargo-drone hub need when demand follows the clock?"
seo_title: "Cargo VTOL hub battery spares: daily demand vs Poisson arrivals"
date: 2026-11-10
tags: [research, aerolog-scaling, drone-logistics]
description: "A simulated 8-pad, 8-charger cargo-drone hub needs the same spare packs at 70% load but twice as many at 85% when demand follows a real daily profile."
---

The aerolog-scaling programme sizes a battery-swap hub for a cargo VTOL. Earlier
milestones assumed Poisson arrivals, then fixed bursts. This one replays a real
daily shape: trips per 15 minutes from City of Chicago open ride-hail data,
scaled to the hub's rate. Ride-hail is a stand-in for time-of-day shape, not
drone orders.

Spares needed for a p95 wait under 5 minutes:

| Hub load | Poisson | Wed profile | Sat profile |
|---|---|---|---|
| 70% | 12 | 16 | 16 |
| 85% | 16 | 32 | 40 |

I predicted at least 2x at 70% and was wrong: it is 1.33x. Near the charger
limit it is 2x or more. Spreading arrivals inside a bin made no difference.
Limits: two days, a proxy for demand, a coarse spares grid, assumed hub inputs.

Data, code and log: `research/aerolog-scaling/` (milestone 6f).
