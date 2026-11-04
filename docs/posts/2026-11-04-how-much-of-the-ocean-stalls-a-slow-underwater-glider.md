---
title: "How much of the ocean stalls a slow underwater glider?"
seo_title: "Ocean currents vs underwater glider speed: where a glider stalls"
date: 2026-11-04
tags: [research, marine, autonomy, ocean-currents, open-data]
description: "Using NASA/JPL OSCAR currents, a 0.2 m/s glider cannot hold a crossing track in 17 to 30% of the ocean, yet beats a propeller AUV on energy elsewhere."
---

Underwater gliders cover thousands of kilometres on a small battery because they move at about 0.2 m/s. The catch is that the ocean often moves faster. Our marine-hull research programme had compared glider and propeller-AUV energy per metre only with a made-up sweep of cross-currents. This step swaps the sweep for data.

We sampled the OSCAR surface-velocity product (NASA/JPL, 1/3 degree, 5-day) at 13 dates in 2013, on a 4-degree grid from 60S to 60N, weighted by cos(latitude). The median current is 0.13 m/s; the 90th percentile is 0.39 m/s. About 30% of the ocean runs faster than 0.2 m/s.

Feeding that distribution into the existing energy model:

- If the whole current is across the transect, the glider cannot hold the track in 29.6% of the ocean and still uses less energy per ground metre than the AUV in 69% of cases.
- At a random heading, those figures are 16.5% and 82.5%.

So the glider's energy advantage is real across most of the ocean, but it ends with a stall where currents match its glide speed, not a gradual fade. OSCAR is smooth, so shelf and tidal currents, where surveys happen, are understated. Coastal data is the next step.

Code, data and log: `research/marine-hull/` (milestone 4g).
