---
title: "Does long-period swell slow a Wave Glider? Not once you account for the vehicle"
seo_title: "Wave Glider speed vs wave period at a fixed vehicle state"
date: 2026-11-11
tags: [research, marine-hull]
description: "Pooled over a 2015 mission, longer wave periods looked slower. At a fixed vehicle state the period exponent is -0.025, indistinguishable from zero."
---

The last few posts followed one fielded Wave Glider, the "Honey Badger" that sailed from Hawaii in 2015, against wave records from the nearest NOAA buoy. The first pass found that at the same wave height, hours with a longer dominant period were slower. That mattered for planning, because the Pacific buoys that came out best in our km/day comparison are exactly the ones with long swell: a median dominant period of 12.9 s in January, against 5.6 to 7.7 s on the Atlantic and Gulf coasts. If long swell slows the vehicle, the Pacific's lead was overstated.

But that first pass pooled the whole mission, and the vehicle itself slowed by about 30% between July and August, for reasons the data don't record. Wave height and period both rose over the same months. So the period effect could be the drift in disguise.

We wrote down five predictions and then fitted speed against height and period with one intercept per mission month, which holds the vehicle's state roughly fixed. We used the same 416 training hours as before.

- **The period exponent is -0.025.** A block bootstrap over days gives a 95% interval of -0.27 to +0.17. The sign is the one we predicted, but the effect is not distinguishable from zero, so that prediction failed. The height exponent barely moves (0.218 to 0.224).
- **No forecast gain.** We added the period ratio to the oracle day-ahead forecast from the earlier post (recent speed, scaled by the change in sea state). Its error ratio was 0.991, with an interval of 0.979 to 1.001.
- **The plan barely moves.** Every 2024 buoy-month shifts by between -0.5% and +1.2%. The Pacific buoys' advantage over the fleet median goes from 1.136 to 1.119 in January and from 1.111 to 1.104 in July. The vehicle's best month over its worst (1.64) still outweighs the best site over the worst (1.19 in January, 1.34 in July).

For this vehicle, then, the earlier "longer period is slower" result was mostly the mission drift. A km/day plan can leave wave period out and lose nothing at this data's resolution. The Pacific's lead comes from bigger waves.

The resolution is the caveat. NDBC reports the dominant period in coarse frequency bins: four Pacific buoys share the same January median. The buoy can also be up to 300 km from the vehicle. Both blur a real period slope toward zero, and the interval doesn't rule out an effect as large as the pooled one at its edge. A second vehicle with on-board wave data, ideally with swell and wind sea separated, is the test that would settle it. The code, data, pre-registered predictions and results file are in `research/marine-hull/` (milestone 6s).

*Written with AI assistance (Claude Code).*
