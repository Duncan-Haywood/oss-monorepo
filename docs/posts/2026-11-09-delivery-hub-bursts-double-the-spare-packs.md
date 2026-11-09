---
title: "How many spare batteries does a cargo-drone hub need when orders arrive in bursts?"
seo_title: "Drone delivery hub spare battery packs: burst arrivals queueing simulation"
date: 2026-11-09
tags: [research, aerolog-scaling, drone-delivery]
description: "A queueing simulation of a cargo-VTOL hub: batches of eight orders need about four times the spare packs that Poisson arrivals do."
---

The `aerolog-scaling` programme asks what a hub needs to keep cargo VTOLs
flying. The previous step sized a hub with 8 pads and 8 chargers and said it
needed about three spare packs per charger. That figure assumed orders arrive
one at a time at random (Poisson).

This step keeps the hub and the mean rate (70% of the charger limit, 8
flights per hour) but lets orders arrive in batches of k at once.

- Poisson (k=1): 12 spare packs keep the 95th-percentile wait under 5 minutes.
- Batches of 4: 24 packs. Batches of 8: 48 packs. Batches of 16: more than 64.
- At 85% load the same bars need 16, 28 and 48 packs for k = 1, 2 and 4.

So the "three per charger" rule is a Poisson rule. A burst takes k packs at
once, and eight chargers refill them at only about 0.19 packs per minute.

Caveats: the batch size is swept, not taken from a demand trace; charge
taper is ignored; the hub timings are vendor figures for small multicopters
and the pack comes from our own assumed sizing model. Preliminary.

Code and output: `research/aerolog-scaling/experiments/hub_throughput/`.
