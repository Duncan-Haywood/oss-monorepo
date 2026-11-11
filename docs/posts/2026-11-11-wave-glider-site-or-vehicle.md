---
title: "Where should you send a Wave Glider? It matters less than how clean it is"
seo_title: "Wave Glider km/day by site: sea state vs vehicle state"
date: 2026-11-11
tags: [research, marine-hull]
description: "At 2024 NDBC buoys, the best site beats the worst by 20 to 34% in km/day. The same Wave Glider's best month beat its worst by 64%."
---

Two earlier posts looked at one fielded Wave Glider, the "Honey Badger" that sailed from Hawaii in 2015. Its speed barely rose with wave height. Its own speed over the previous day was the best forecast of its speed the next day. Within a single month, where the vehicle's condition holds roughly steady, speed scaled as about wave height to the power 0.22, so doubling the wave height adds about 16%.

That raises a planning question. If you're choosing where to deploy one of these vehicles, how much does the site matter compared with the state of the vehicle itself?

We took that measured response and applied it to every hour of 2024 wave records at the marine-hull programme's NDBC buoys: nine with full January records and eleven in July, on the Atlantic, Gulf and Pacific coasts. For the vehicle state we used the 2015 vehicle's own months. Each month gets an index, its median speed divided by wave height to the 0.22. The best month was July and the worst October. We wrote the predictions down before running anything.

The results:

- **Site:** in January the best buoy (46013, off northern California, median wave height 2.55 m) plans 1.20 times the distance of the worst. In July the gap is 1.34, between the Pacific buoys and the calm Gulf and Nantucket ones (median wave height about 0.4 m).
- **Vehicle:** the same vehicle's best month over its worst is 1.64, the same factor at every site. The July-to-August step alone is 1.41.
- **Planned distance:** 49 to 52 km/day across the fleet at the best state, and 30 to 32 at the worst. The single best buoy-month is 61 km/day, still well under the 86 km/day a solar boat sustains in this programme.
- 82% of the variance in log km/day across buoys, months and states is between vehicle states. Changing the exponent across its fitted range (0.19 to 0.25) moves the fleet figures by 2% at most.

So a Wave Glider's plan is set mostly by the vehicle, and the site is a correction of a fifth to a third. A planner gets more from logged speed and a hull-cleaning schedule than from a better wave climate.

The limits are real. The vehicle index comes from a single mission. May, the launch month, may be slow for reasons that have nothing to do with fouling. The exponent was fitted on Hawaiian seas and is applied here to seas that vehicle never sailed. Wave period is ignored, even though the earlier run found longer-period swell slightly slower at the same height. The code, data, pre-registered predictions and results file are in `research/marine-hull/` (milestone 6r).

*Written with AI assistance (Claude Code).*
