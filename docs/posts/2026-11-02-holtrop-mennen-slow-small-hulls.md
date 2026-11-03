---
title: "Does Holtrop-Mennen overstate drag for slow small boats?"
seo_title: "Holtrop-Mennen accuracy at low Froude number: 308 tank points"
date: 2026-11-02
tags: [research, marine, hull-resistance, honesty]
description: "Checking the standard ship-resistance regression against 308 Delft yacht-series tank points: fine at Froude 0.2 to 0.3, 1.3 to 2.2 times high at survey speeds."
---

The `marine-hull` research programme asks which small autonomous survey craft carries a payload furthest per kWh. Its resistance model leans on Holtrop-Mennen (1982), a regression fitted to ships tens of metres long. Does it hold at survey speed on a small hull?

Today's run compared it with the 308 public tank points of the Delft yacht hull series (22 hulls, Froude number 0.125 to 0.45). The table has no midship or waterplane coefficients and no model length, so those were swept.

- At Froude 0.2 to 0.3, Holtrop-Mennen is within 20% of the tank value for 44% to 79% of points, depending on the swept inputs.
- At Froude 0.125 to 0.2, where a survey boat spends its time, it over-predicts residuary resistance by a median 1.3 to 2.2 times in every swept case. The absolute gap is small (about 0.4 per mille of weight at Froude 0.15).
- Above 0.4 it leaves its validity range and falls well short.

Caveats: these are sailing yachts with keels, not survey boats; the data came from a public mirror that I did not check against the 1981 paper; the result is exploratory. The code, data copy and log are in `research/marine-hull/` (LOG milestone 3g).
