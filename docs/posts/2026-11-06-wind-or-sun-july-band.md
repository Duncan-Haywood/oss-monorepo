---
title: "Sail or solar for an ocean drone: in July the answer is a band, not a number"
seo_title: "Wind vs solar for autonomous ocean vehicles: how much light-air sailing is real?"
date: 2026-11-06
tags: [marine-hull, research, autonomy]
description: "A model of a sailing ocean drone gets 0.71 to 0.93 times the distance of a solar one in July, and 1.4 to 1.5 times in January, once drift is kept out of the sail credit."
---

Would a small sailing drone cover more sea per day than a solar-electric one? Using 19 buoy-months of real NDBC wind and a drone model checked against 864 fielded Saildrone days, January is clear: sail beats the solar ceiling (86 km/day) by 1.40 to 1.47 times, however light-air hours are treated.

July is not. Below 4 m/s the model is not a bound, because about half a metre per second of drift and current explains most of the speed over ground. Three treatments give 0.93 times solar (full credit), 0.79 times (a drone fitted with drift kept out of the credited distance) and 0.71 times (zero credit). I wrote the 0.79 prediction down before running it, and it held.

So the claim the marine-hull programme can defend is: wind is ahead of sun in winter and at or below it in summer, with July a band of 0.7 to 0.9. The light-air drone is a curve fit with a scalar drift, not a physical hull; two months, US buoys, no tack cost or sea state.

Code and the full log: `research/marine-hull/` (milestone 6t).
