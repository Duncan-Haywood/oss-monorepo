---
title: "A solar boat that remembers last years' sun matches the oracle"
seo_title: "Learned seasonal sun-forecast correction for solar USV energy"
date: 2026-11-14
tags: [research, marine-hull]
description: "A solar boat that scales its sun climatology by its own monthly harvest ratio from earlier years wins 120 of 128 cases, level with an oracle."
---

The [last step](2026-11-14-marine-hull-solar-boat-seasonal-forecast-error.md) left a gap. A solar boat plans each day's speed from the average sun for that day of the year (the climatology) and its own recent harvest. It picks its battery feedback time from a 90-day ratio of harvest to climatology. When the climatology was wrong both on average and by season, that self-tuning rule beat the plain 7-day rule in 104 of 128 cases. An oracle told each day's bias won 120. The last step also measured the real seasonal error of a ten-year NASA POWER climatology. It was small at most points but 4.5 to 8.5% above 50 degrees latitude.

A boat on a repeat deployment has something the oracle stands in for: its own earlier years. So this step gave it one: a month-by-month table of how much it harvested against how much the climatology promised, learned over five years (2005 to 2009) and used on the next five (2010 to 2014), and the other way round. The boat multiplies the climatology by that table before it does anything else. We wrote seven predictions down before running anything. All seven held.

What came out:

- **It closes the whole gap.** With the learned correction the self-tuning rule wins 120 of 128 mean-plus-seasonal bias cases, the oracle's score, and 158 of all 168 cases against the oracle's 152. It goes at least as far as the 7-day rule in every one of the 168.
- **The shape matters, not just the average.** Correcting by one five-year average ratio per point gets 109 of 128. At high latitudes it does worse than no correction.
- **The real-data test is where it counts.** The swept biases repeat exactly in the learning years, so learning removes them by design. The honest test adds no bias at all. It looks at the nine points where the climatology's own seasonal error is above 3%, mostly above 50 degrees. There, the uncorrected self-tuning rule beats the 7-day rule in 1 of 8 cases: it plans on a climatology that is wrong by month and falls behind on distance. With the learned correction it wins 5. The corrected climatology paired with a plain fixed feedback time wins 7.
- **What still fails.** The corrected rule's 10 losses are all big packs (10 to 20 kWh) under a pessimistic climatology. They go 13 to 21% further than the 7-day rule but spend slightly more hours with the payload dark.

For anyone building a solar boat's energy manager: if the boat has sailed the same water before, scale the sun climatology by last years' month-by-month harvest ratio first. After that the battery rule matters less. Above 50 degrees, a fixed 30 to 60 day feedback was the better partner for the corrected forecast in this sweep.

Limits: the real-data test is small, 8 cells overall and 8 at the high-latitude points. The nine points were picked using all ten years, including the scored ones. The model is simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. The next step asks how few years of history are enough, and whether the boat can learn the table during its first deployment. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zza).
