---
title: "A tack-cost sweep that silently stopped at 60 seconds, and what the fixed one shows"
seo_title: "Sailing drone tack cost: does header-following beat edge tacking?"
date: 2026-11-06
tags: [marine-hull, research, autonomy]
description: "At a measured 120 to 360 s tack cost the header-follower's 3-point edge vanishes, while the gap to a clairvoyant controller grows from 12 to 26 points."
---

Fielded Saildrone data put the effective cost of a tack at 218 s (127 to 301). Earlier marine-hull runs had only priced a tack at 0, 30 and 60 s, so I reran the three tack controllers (edge tacking, header-following, clairvoyant) on 24 stations of real NOAA CO-OPS wind at 120, 240 and 360 s.

The first run returned identical numbers at all three costs, matching the 60 s row. The simulator clipped each tack's penalty to one 60-second step, so any larger cost was silently 60 s. I fixed the code so a tack's dead time carries over several steps (for 60 s or less the output is unchanged, so earlier results stand), added tests, and reran.

Results, July holdout, 360 windows: the header-follower's edge over plain edge tacking falls from 3.2 points at 30 s to 2.3, 0.8 and 0.0 points at 120, 240 and 360 s, and it wins in only 49% of windows at 360 s. I had predicted the gain would rise to 5 or more points; it did not. The gap to a clairvoyant controller grows from 12 to 26 points, so at a realistic tack price the value is in knowing the wind ahead, not in a smarter reaction rule.

Caveats: tack cost here is pure dead time, while the 218 s figure is an effective loss including selection effects; the forecast-lead controllers still clip and need the same fix before they are rerun.

Code and log: `research/marine-hull/` (milestone 6x).
