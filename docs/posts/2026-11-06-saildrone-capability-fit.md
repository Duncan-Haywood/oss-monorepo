---
title: "How fast can a wind-driven survey drone really go? Fitting a model to 131,000 Saildrone blocks"
seo_title: "Saildrone speed versus wind: fitting a sail-drone model to data"
date: 2026-11-06
tags: [marine-hull, saildrone, research]
description: "Fitting a simple wing-sail drone model to the 90th-percentile speed of public Saildrone tracks, trained on 2018 and tested on 2019."
---

The marine-hull research programme asks whether a wind-driven survey drone beats a solar boat. Earlier steps found the default drone model about 2.5 times too fast. This step fits it to public NOAA PMEL Saildrone tracks (131,535 ten-minute blocks) on 2018 and tests it on 2019.

Fitting the mean speed per wind cell gives a 0.45 m2 effective sail. Fitting the 90th-percentile speed, the capability a drone has rather than what a mission uses, gives 0.90 m2. On 329 unseen drone-days the capability model's daily distance is 1.14 times the observed median, flat across winds.

The bound is weaker than hoped: only 68% of 2019 blocks sit under it, and 54% in winds below 4 m/s. Pre-registered predictions: one held, two refuted, one held for the cause. Wind versus sun stays close to even, with the wind drone ahead in January and level in July at most. Details and limits are in the [research log](../../research/marine-hull/LOG.md).
