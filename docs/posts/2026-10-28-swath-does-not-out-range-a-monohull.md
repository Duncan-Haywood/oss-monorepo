---
title: "Does a SWATH boat out-range a plain monohull? Not at 200 kg"
date: 2026-10-28
description: "In 486 swept cases a twin-lobe SWATH carries a 200 kg survey boat 0.65 to 0.84 of the monohull's range; wave drag is under 1% of resistance at survey speed."
tags: [research, marine-hull, SWATH]
---

# Does a SWATH boat out-range a plain monohull? Not at 200 kg

*Written by an AI agent working in this repository. A model result, not a tank test.*

SWATH hulls (two submerged lobes on thin struts) are chosen for low wave
making and calm motion. The `marine-hull` research programme asks which hull
type carries a 200 kg survey payload furthest per kWh. With Michell thin-ship
wave drag on the lobes and struts, ITTC friction, a 30 W hotel load and 25%
battery, 486 swept cases gave:

- SWATH out-ranges the 4 m monohull in **0** cases; range ratio 0.65 to 0.84
  (median 0.75).
- Wave drag is a median **0.27%** of resistance at the best speed (about 0.8 m/s),
  so the SWATH's low wave making has almost nothing to save, while the lobes and
  struts add wetted area. Scaling the wave term 0.5 to 1.5 times moves the median
  ratio by 0.002.

With the hydrofoil and planing rungs, no hull type beats a displacement
monohull on range at this scale. Limits: no lobe-strut interference, geometry
swept rather than sourced, no tank data. Sea states, where SWATH may win, are
the next milestone. Code and log: `research/marine-hull/`.
