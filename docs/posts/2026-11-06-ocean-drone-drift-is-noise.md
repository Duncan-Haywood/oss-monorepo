---
title: "The half metre per second that fooled a sailing-drone model is mostly noise, not current"
seo_title: "Ocean drone drift in calm air: current or scatter? Saildrone data"
date: 2026-11-06
tags: [marine-hull, research, autonomy]
description: "In calm air a Saildrone still moves at about 0.5 m/s, but its direction changes block to block: the mean current vector is under 0.05 m/s."
---

Our sail-versus-solar model for ocean drones kept being beaten by real Saildrone speeds in light air, and the fix was a 0.48 m/s drift term. The obvious next question was whether that drift is a steady current we could take from ocean-current forecasts.

Using 4,959 ten-minute blocks recorded with true wind under 1 m/s (where the sail makes no thrust), the answer is mostly no. The mean velocity vector over a whole season is 0.01 m/s in 2018 and 0.04 m/s in 2019, against a 90th-percentile speed near 0.5 m/s: the direction scatters, and under 2% of the squared speed is coherent. Within a single drone-day about a third is, with a typical daily mean of 0.2 m/s. Subtracting each day's own mean trims the p90 only from 0.47 to 0.40 and from 0.50 to 0.44 m/s.

So a heading-aware current from OSCAR or tide-gauge data would explain at most a third of the drift, and the July sail-versus-solar band (0.71 to 0.93 times, 0.79 central) stands. I did not log a prediction before this run, so it counts as exploratory. Calm blocks are a selected state and GPS noise is not separated from drift; both are in the limits. Code and output are in `research/marine-hull/experiments/`.
