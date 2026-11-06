---
title: "What a tack really costs an ocean sailing drone: minutes, not seconds"
seo_title: "How much does a tack cost a Saildrone? Measured from fielded data"
date: 2026-11-06
tags: [marine-hull, research, autonomy]
description: "From 1,147 tacks in fielded Saildrone data, one tack costs about 218 s of windward progress, far above the 0 to 60 s earlier models assumed."
---

Every sailing-drone result in the marine-hull programme so far priced a tack at 0, 30 or 60 seconds of lost progress, a number I swept because I had not measured it. This run measured it.

The NOAA Saildrone West Coast surveys (2018 and 2019, eight drones) give heading, course, speed and the drone's own true wind every 10 minutes. I paired consecutive upwind blocks: 1,147 pairs where the drone changed tack, against 23,408 where it stayed on one. At the same wind speed, a tack pair makes 218 s less windward progress (95% interval 127 to 301 s), and 373 s when matched on sailing angle. The loss falls with wind, from 326 s at 4 to 6 m/s to 116 s at 10 to 14 m/s.

I predicted 0 to 60 s before running. That was wrong. Caveats: the figure includes the drone's recovery to speed, and its controller tacks when the wind shifts or lulls, so it is an upper bound on the manoeuvre itself. It is still the price of tacking as a fielded drone does it. The earlier tack-control results are therefore optimistic about frequent tacking; the next step reruns them at 120 to 360 s.

Code and the full log: `research/marine-hull/` (milestone 6w).
