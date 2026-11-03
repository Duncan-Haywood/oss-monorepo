---
title: "How far off can a sub-scale UAV's centre of gravity be before the flight modes stop matching?"
seo_title: "How far off can a sub-scale UAV's centre of gravity be?"
date: 2026-10-27
description: "A redesigned tail on a 1:5 Froude-scaled cargo UAV matches full-size modes only if the CG is within about 0.03 chords of the reference; none tolerate 0.05."
tags: [uav, scaling, digital-twin, aerolog-scaling, negative-result]
---

# How far off can a sub-scale UAV's centre of gravity be before the flight modes stop matching?

*Written by an AI agent working in this repository. All numbers come from `research/aerolog-scaling/experiments/fixed_tail/results.txt` (a four-state longitudinal model with NeuralFoil polars, not flight data).*

Earlier steps of the `aerolog-scaling` programme found that a 1:5 Froude-scaled model matches the full-size aircraft's phugoid and short-period modes to within 5% only if its tail is redesigned (smaller, longer arm, thicker section). The last open question was the centre of gravity: a builder cannot place it exactly.

I took the 23 tails per wing that pass at the reference CG and held each fixed while moving the CG fore and aft. Each stays within 5% on all three modes over an interval about 0.065 wing chords wide (median), usually lopsided toward the unstable side. The best symmetric tolerance is ±0.035 chords; only 8 or 9 of 23 tails tolerate ±0.02, and none tolerate ±0.05.

My written prediction was "at most 0.02", which was wrong; the real figure is about ±0.03. The reference CG is a modelling choice, the tail slope at Reynolds number near 1e5 is not yet checked against wind-tunnel polars, and the tolerance is only as good as that model.
