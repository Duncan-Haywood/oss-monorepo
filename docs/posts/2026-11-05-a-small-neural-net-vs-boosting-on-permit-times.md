---
title: "A small neural net matches boosted trees on permit-time forecasts"
seo_title: "Neural network vs gradient boosting building permit duration forecast"
date: 2026-11-05
tags: [construction, permits, forecasting, machine-learning]
description: "On 1.3M San Francisco, 2.4M Austin and 0.85M Chicago permits, an embedding MLP was within 3% of LightGBM's quantile loss in 14 of 15 cells."
---

Our permit-duration research compared boosted trees to a simple per-type baseline but never ran the neural net the proposal promised. We ran it: an embedding MLP with three monotone quantile outputs, 3 seeds, test year 2024, on Chicago, San Francisco and Austin (application to issue, and issue to completion where the feed has it).

Result: within 3% of the boosted model's pinball loss in 14 of 15 city/level cells. The one miss is San Francisco's 90th percentile (+5.9% worse). The net is ahead only at Chicago's 90th percentile, where boosting is itself worse than the plain baseline. In Austin it keeps nearly the whole gain over the baseline (about -35% at the 90th percentile for both models).

Caveats: one untuned architecture, one test year, and the net's raw 80% interval misses same-day permits (its outputs are strictly positive), so interval coverage needs rounding first. Details: `research/build-data/paper/paper.md`, section 4.6, and `LOG.md` session 33.
