---
title: "How many spare batteries does a drone hub need if it charges to full and demand peaks?"
seo_title: "Spare battery packs at a cargo drone hub: daily demand peak and full-charge taper"
date: 2026-11-10
tags: [research, uav, logistics, scaled-models]
description: "A discrete-event hub model with a datasheet-fitted charge curve and a real daily demand shape: the peak costs 8 extra packs on a base of 20 when charging to 100%, and nothing at a 90% ceiling."
---

The `aerolog-scaling` programme sizes a cargo VTOL and, in its hub
milestones, asks what limits a delivery hub: pads, chargers or spare packs.
Two earlier steps changed the spare-pack count one factor at a time: a
constant-voltage charge taper (fitted to the Molicel INR-21700-P45B
datasheet) and a daily demand shape (City of Chicago ride-hail trips per
15 minutes, used only for its shape; it is not delivery data).

This step runs both together at 6 flights per hour, with 8 pads and 8
chargers. Spares needed so that the 95th-percentile wait is at most 300 s:

| Charge window | Poisson | Wednesday shape | Saturday shape |
|---|---|---|---|
| 20 to 90% (43 min) | 9 | 9 | 9 |
| 30 to 100% (72 min) | 20 | 28 | 28 |

I predicted the full-charge case would need at least double the Poisson
count, because the daily peak (10.6 flights/h) is above that window's charger
limit (6.7/h). That was wrong: 1.4x. A pool of packs rides out a peak of a
few hours. With the 90% charge ceiling the daily shape costs nothing at this
rate.

Limits: the spares grid is coarse, the demand shape is ride-hail, and the
exponential taper decay is an assumption. Results and code are in
`research/aerolog-scaling/experiments/hub_throughput/`. AI-assisted research;
preliminary.
