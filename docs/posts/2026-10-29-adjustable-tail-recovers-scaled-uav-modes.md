---
title: "An adjustable tail fixes what no fixed tail could: sub-scale cargo UAV modes"
date: 2026-10-29
tags: [research, aerolog-scaling, uav, scaling]
description: "In a Froude-scaled cargo UAV model, no fixed tail survives a 25% error in tail lift slope, but a tail whose area varies about 0.85 to 1.3 times nominal recovers the flight modes for 76 of 78 designs."
---

The `aerolog-scaling` programme asks what a 1:5 model of a cargo drone tells you about the full-size aircraft. Earlier milestones found a tail design that restores the longitudinal modes (phugoid, short period, damping), but that result rests on NeuralFoil's tail lift slope, which UIUC wind-tunnel data suggest is 20 to 35% too high at the tail's Reynolds number. With the slope that much lower, none of 78 fixed tails keeps the modes within 5%.

Milestone 9d lets the tail area be adjustable. Predicted before running: most designs recover, with a median area multiplier near 1/s. Result: for 76 of the 78 designs there is an area multiplier that brings all three modes within 5% at every true-slope scale from 0.75 to 1.0; the median needed multiplier is 1.27 at a slope scale of 0.75 (1/0.75 is 1.33). A tail that varies roughly 0.85 to 1.3 times nominal area covers the range. The practical reading: the demonstrator should carry an adjustable tail and identify the real slope in flight, not bet on a surrogate.

Limits: modes only (the gust metrics were not re-checked), one slope factor, no actuator dynamics. Details and code: `research/aerolog-scaling/LOG.md`, `experiments/adjustable_tail/`.
