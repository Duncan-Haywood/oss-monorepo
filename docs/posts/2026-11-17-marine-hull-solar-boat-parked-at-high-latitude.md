---
title: "At 50 to 60 degrees the solar boat is mostly parked, so its sun-correction scores there say little"
seo_title: "Solar USV at high latitude: why no sun correction wins"
date: 2026-11-17
tags: [research, marine-hull]
description: "No sun-correction rule beat the 7-day baseline at eight 50 to 60 degree points. Every loss was distance, not dark hours: with 50 W the boat barely moves."
---

The [previous step](2026-11-17-marine-hull-solar-boat-clamp-one-bright-point.md) of this programme left a strange zero behind. Take the eight ocean points at 50 to 60 degrees of latitude and pool them. No rule for correcting the boat's sunlight climatology beats the simple 7-day baseline (B) in any of 168 cases. That includes no correction at all. A rule wins a case when it sails at least as far as B and spends no more hours with the payload dark.

So which half of that test fails? Before the run we predicted dark hours: B looked hard to beat on darkness. We wrote down six predictions. One held.

What we found (every earlier count reproduced exactly):

- **Every loss is distance, never darkness.** For each rule and each set of three learning seasons, all 168 pooled losses are cases where the rule sails less than B. In none of them does it run dark for longer. The corrected rules cover about a quarter of B's distance (median 0.22 to 0.27) and spend about 22 fewer dark hours per pool.
- **It is not a near miss.** We relaxed the test by up to 480 dark hours or 2% of the distance. Not a single case flips.
- **The boat is barely moving.** With its 50 W payload, the modelled boat sails **0 km in ten years** at three of the eight points under every rule, B included. B covers 37 and 48 km at two more. Those points' "wins" are ties at zero. The two Southern Ocean points lose every case: B sails 1,367 and 1,786 km there, against 74 and 356 for no correction. Only the North Sea has a real contest, and the rules win 92 to 97 of 168 cases there.
- **This explains the last step's finding.** One point at 30°S carried the "high-latitude" score. On the real sunlight shape it holds 94% of B's distance across the nine points.

For a designer, the advice is short. At 50 to 60 degrees with this payload, the question is whether the boat can work at all. Which sun correction it uses barely matters. The programme's high-latitude rule rankings should not be used there. The [Wave Glider payload step](2026-11-17-marine-hull-wave-glider-payload-power.md) reached a similar conclusion from the other side: the largest payload a Wave Glider carried all year at those latitudes without a dark day was 0 to 6 W. Next, we rescore those points with a payload the boat can actually carry, or rank rules on a score that leaves out ties at zero distance.

Limits: in-sample on 2005 to 2014, three-season learning sets only. The per-point distance table uses the real sunlight shape only, and we added it after seeing the main run. The model covers one boat, one set of weights and calm water at a daily time step.

Code, results and the full log: [`research/marine-hull`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/marine-hull) (`experiments/run_band_failure.py`, `experiments/results_band_failure.txt`).
