---
title: "Does swapping drone batteries fix a delivery hub's throughput?"
seo_title: "Drone delivery hub throughput: battery swap vs charging on the pad"
date: 2026-11-09
tags: [research, aerolog, drone-delivery, queueing]
description: "A queueing model of a delivery-drone hub: swapping cuts pad time 8x, but chargers become the limit and the gain is about 9%."
---

The aerolog programme asks what limits a fleet of delivery aircraft once the
aircraft themselves work. This step looks at the ground: landing pads,
chargers and spare packs, in a discrete-event model checked against the Erlang C
queueing formula (simulated waits within 0.6% of it).

Two vendor figures set the clock: a battery-and-package swap in under 60 s
(Matternet's Landing Station page) and a 32-minute 20-to-90% charge (DJI
Dock 2). Both are claims for small multicopters, not tests, and not a cargo VTOL.

With 4 pads, charging on the pad saturates at 9.8 flights an hour. Swapping lifts
the pad limit to 80, but the depleted packs still need 70% of 32 minutes each on a
charger, so 4 chargers cap the hub at 10.7 flights an hour: 1.09 times the
charge-in-place figure. Swapping moves the bottleneck from the pad to the charger,
and chargers bound in every case run. Spare packs matter too: at 90% load, 8 chargers
needed about 24 spares (three per charger) before waits fell from 790 s to 37 s.

Limits: Poisson arrivals, a linear charge time, one pack per aircraft. Code, results
and tests: `research/aerolog-scaling/experiments/hub_throughput/`.
