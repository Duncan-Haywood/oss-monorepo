---
title: "Does a buoyancy glider beat a propeller AUV at any hotel load we can source?"
seo_title: "Glider vs propeller AUV range: hotel load from Tethys and REMUS figures"
date: 2026-11-03
tags: [research, marine, auv, glider]
description: "Against every propeller-AUV hotel load I could source (8 W to 175 W), a Seaglider-budget glider model has the longer best range in all 270 swept cases."
---

The marine-hull programme asks whether a buoyancy glider out-ranges a same-size propeller AUV. Earlier steps showed the answer turns on the AUV's non-propulsion ("hotel") power. This step looked for real figures.

I found no measured REMUS or Bluefin power budget. What exists: the MBARI Tethys paper (Bellingham et al., AUV 2010) estimates 8 W as achievable for a small sensor payload, and REMUS-class vendor endurance (1.5 kWh, 12 h) implies 104 to 175 W of non-propulsion load. One review's "O(10 W), 22 h" for REMUS100 contradicts those and was not used.

Against a glider load taken from a measured Seaglider dive (0.095 W), the glider has the longer range in 270 of 270 cases at 8, 12, 104 and 175 W, with or without extra dive electronics. The AUV only wins below roughly 0.4 to 1.7 W. Caveats: this is energy per metre, not time (the glider is slower), and the 8 W is a designers' estimate, not a measurement.

Code, results and the log: `research/marine-hull` (milestone 4e).
