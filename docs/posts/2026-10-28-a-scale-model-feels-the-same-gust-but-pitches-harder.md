---
title: "A scale model feels the same gust load but pitches 30% harder"
date: 2026-10-28
description: "In a four-state model, a 1:5 Froude-scaled cargo aircraft matches full-size gust load factor within 2% but its peak pitch rate is 27 to 33% high."
tags: [research, aerolog-scaling, scale-models, flight-dynamics]
---

The `aerolog-scaling` programme asks what a 1:N model of an electric cargo
aircraft tells you about the full-size one. This step sent a Froude-scaled
1-cos vertical gust (gradient 5, 12.5 and 25 chords) through the four-state
longitudinal model with NeuralFoil polars at each surface's own Reynolds number.

At 1:5, the uncorrected model's peak load-factor increment is within 2.0% of the
full-size aircraft at all three gust lengths. Its peak pitch rate is 26.8 to
32.6% high and its peak pitch attitude about 20% high, which fits the 15%
high short-period frequency found earlier. Of the 17 wings that restore the
power ratio, none is within 10% on all three metrics.

Limits: no gust penetration lag, no alpha-dot term, rigid body, one reference
aircraft, and the tail lift slope is itself uncertain by 20 to 35% against UIUC
tunnel data. The UIUC host was blocked in this session, so the measured NACA
0012/0015 step stays open. Data: `research/aerolog-scaling/experiments/gust_response/`.
