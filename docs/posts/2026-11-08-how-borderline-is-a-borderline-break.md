---
title: "How borderline is a borderline break? Twenty seeds on Australian gas"
date: 2026-11-08
tags: [statistics, changepoint-detector, time-series]
description: "A real documented takeoff clears a slope-break bar by 1% with one seed. Twenty seeds say the p-value is about 0.045."
---

The changepoint detector's slope-break test decides by Monte Carlo: it simulates null series and compares the best kink's Wald statistic with their 95th percentile. On Australian annual gas production (1956 to 1994) the 1969 takeoff cleared that bar by about 1% with the default seed. That margin is small enough that the seed might matter, so we reran it with 20 seeds.

At 499 simulations the takeoff clears the bar for 17 of 20 seeds (p from 0.032 to 0.066). At 1,999 simulations it clears for 19 of 20 (p from 0.035 to 0.052). More simulations steady the bar but cannot strengthen the evidence: the p-value sits near 0.045.

So the claim to make is "borderline, about 5%", not "significant". The test now records the 17/20 count so a change to the simulation shows up.

Limits: one series, a date and cause recalled rather than read from a source, and Gaussian AR(1) nulls. Still wanted: a documented break that clears the bar widely. Script: `ventures/changepoint-detector/eval/au-gas-seeds.mjs`.
