---
title: "The drone conflict closed form against the simulator's exact expectation: 0.26% apart, same split every time"
seo_title: "Drone conflict closed form vs exact simulator expectation"
date: 2026-11-16
tags: [research, uav, airspace, reproducibility]
description: "Drone conflicts summed over every destination pair, no sampling: the closed form is 0.26% high and picks the best layer split in 24 of 24 layouts."
---

`aerolog-scaling` asks a practical airspace question: when eight drone delivery
operators share a city, which of them should share an altitude layer? The
programme answers it with a closed form, a formula for the expected number of
losses of separation between every pair of operators. Until today, every check
of that formula was against a *sampled* reference: 400,000 random flight pairs
per layout, which milestone 11x found carry about 0.8% noise. That left one
question open. How far is the formula from the simulator itself, once the noise
is gone?

Today's step (11aa) removes the sampling. The simulator's expected conflict
rate is an average over pairs of flights. For each pair, the exact window of
launch offsets in which the two drones come within 50 m has a closed-form length
(milestone 11r). So the expectation is a finite sum over every pair of
destinations: about 1.6 billion interval computations per layout, vectorised in
numpy. The eleven predictions were committed before any layout ran.

**On 11g's 24 random eight-operator layouts over 2014 New York pickup points:**

| | result |
|---|---|
| closed form / exact expectation (en-route, pooled) | **1.0026** |
| spread over layouts (sd) | 0.28% (it was 0.91% against the sampled reference) |
| layouts where the closed form picks the exact best layer split | **24 of 24** |
| largest change in any planner rule's mean loss vs the closed-form reference | 0.09% |
| cost of the exact reference | about 1,000 CPU s per layout (closed form: 50 s) |

Nine predictions held. Two were refuted: the cost (I predicted at most 800 s on
average), and the bound I set on the zone-label quadrature. The 4-point
sub-rules were up to 1.8% off the 8-point rule. A check written after seeing
that showed the 8-point rule matches a 32-point rule to 2e-5, because the two
shifted 4-point grids err in opposite directions. The bound was wrong; the
numbers were fine.

**One bug was worth the test suite.** The shortcut "the return legs are the outbound
legs run backwards" holds for interval lengths, but not for zone labels when two
drones fly the same velocity, for example two flights of one operator to the same
address. The estimator then labels the closest approach at the start of the
overlap, which is a hub for outbound legs and a delivery point for return legs.
The first kernel lost all same-operator en-route weight, and the brute-force test
caught it before any real layout ran.

**What the residual looks like:** the closed form is 0.07% to 2.2% high over
pairs of different operators and up to 4.4% low over one operator's own
head-on pairs. Those same-operator pairs share a layer under every split, so
they never change the decision.

For this question, then, the closed form is the simulator's answer, to well
within anything a planner would notice, and the record from 11g to 11z holds on
the simulator's own expectation. Limits: it is exact for the model, not for real
flights. Straight legs, no avoidance and no wind, one city, ride-hail pickups
standing in for deliveries. Results and code:
[`research/aerolog-scaling`](../../research/aerolog-scaling/), milestone 11aa.
