---
title: "A wind forecast is worth more, not less, when a tack costs minutes"
seo_title: "Sailing drone wind forecast value at a 240 s tack cost"
date: 2026-11-07
tags: [marine-hull, research, autonomy]
description: "Replanning a sailing drone on a forecast beats the best rule-based tacker by 8.7 points at a 240 s tack cost, against 5.4 at 30 s. Persistence does not help."
---

The previous post found that a 218 s measured tack cost erases the header-following rule's edge. The open question was whether a wind forecast keeps its value at that price. I predicted it would grow, and logged a threshold (at least 6 points over the header rule at 240 s) before running.

Result, 96 July windows from 24 US coastal stations: a perfect 15-minute-smoothed forecast, replanned hourly, beats the header rule by +7.5, +8.7 and +11.0 points at tack costs of 120, 240 and 360 s (+5.4 at 30 s earlier). The prediction held. A costly tack makes knowing which ones to skip worth more.

A second prediction failed: that persistence (no-skill forecast) would at least match the header rule. At 240 s it is 0.6 points worse (95% interval -2.0 to -0.1). A forecast helps only if it has skill: a 60-minute-decay forecast gains 2.4 points, a 240-minute one 4.5.

Limits: the forecast is a synthetic lead-decay model, not real HRRR output, and a tack is pure dead time. The next step runs real HRRR forecasts at the fielded tack price. Code and logs: `research/marine-hull`.
