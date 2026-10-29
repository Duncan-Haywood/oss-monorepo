---
title: "How noisy can the in-flight measurement be before the adjustable tail stops working?"
date: 2026-10-29
tags: [research, aerolog-scaling, uav, scaling]
description: "Setting a sub-scale UAV's tail area from noisy mode estimates keeps gust response within 10% for most designs at 2% noise, but no design is reliable at 5%."
---

The `aerolog-scaling` programme builds a 1:5 model of a cargo drone and asks what it reproduces of the full-size aircraft. Earlier milestones found that no fixed tail survives a 25% lower tail lift slope than the surrogate predicted, but a tail whose area is set in flight from the measured short-period recovers both the modes and the gust peaks (67 of 78 designs within 10%). That assumed the modes are identified exactly.

Milestone 9f adds measurement error: the pilot sees phugoid frequency, short-period frequency and short-period damping with 0, 2, 5 or 10% Gaussian error, picks the area multiplier on that basis, and the true model is scored. Predicted beforehand: 2% costs little (held), 5% halves the passing share (refuted), 10% leaves under 20 designs reliable (held).

Result: the share of runs with worst gust error within 10% is 86% with no noise, 84 to 86% at 2% noise, 58 to 61% at 5% and 33 to 35% at 10%. At 5% noise no design passes in 90% of draws. So the demonstrator's pitch-doublet analysis needs mode estimates good to roughly 2 to 3%, damping ratio included, which is the hard one.

Limits: independent errors per mode, noise on the mode summary rather than a fitted time-domain doublet, one seed. Details and code: `research/aerolog-scaling/LOG.md`, `experiments/noisy_identification/`.
