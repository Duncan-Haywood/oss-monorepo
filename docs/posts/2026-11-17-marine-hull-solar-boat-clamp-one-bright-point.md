---
title: "The solar boat's 'widen the correction up north' result came from one bright point"
seo_title: "Solar USV sun correction: the high-latitude result was one point"
date: 2026-11-17
tags: [research, marine-hull]
description: "Weighting nine high-latitude points equally, a wide sun-correction clamp's lead fell from 21.2 to 2.5 of 168 cases. The narrow clamp is the safer default."
---

A solar survey boat plans its battery use from a sunlight climatology, and after a season or more at sea it can correct that climatology month by month from its own log. The last few steps of this programme asked how tightly to cap those learned corrections. They kept finding the same trade-off: a narrow cap (AP, set from the spread of the boat's own ratios) wins on ordinary water, while a wide one (a fixed ±15%) wins at nine "high-amplitude" points, eight of them at 50 to 60 degrees of latitude.

The [previous step](2026-11-17-marine-hull-solar-boat-clamp-sqrt-seasons.md) found a crack in that. The high-latitude score adds up distance and dark hours across the nine points before asking whether a rule beats the baseline. One point, at 30°S in the Pacific, has far more sun and distance than the other eight, so it can carry the sum. This step checked that directly, with ten predictions written down before anything ran. It also swept how fast the cap should widen with the length of the log (h = spread × k^alpha, alpha 0, 0.5 and 1, over one to five seasons).

What we found (seven of ten predictions held; every earlier count reproduced exactly):

- **The high-latitude lead was mostly one point.** With three seasons of log, ±15% beats the narrow cap by 21.2 of 168 cases on the old pooled score. Weight the nine points equally and the lead is 2.5. Drop the 30°S point and pool the other eight: no rule wins a single case at three or more seasons. That includes no correction at all.
- **So the narrow cap is the safer default.** On the equal-weight score, AP is never more than 3.3 cases behind the best rule with two to four seasons. It also gets better on ordinary water as the log grows: 160.8 of 168 cases with four seasons and 161.0 with five, against 139 for no correction.
- **A wider cap still pays when the sun data are wrong.** If the boat plans on NASA POWER but sails under ERA5's sun, the √k cap wins 47.0 cases at the eight band points against AP's 36.2. The fixed ±15% falls to 7.9 there.
- **On the old score, √k is the robust middle.** Scaled by k (alpha 1), the cap wins the high-amplitude pools but gives up 5 to 11 cases on ordinary water. From three seasons on, √k has the smallest worst-case shortfall of the three exponents.

The earlier counts stand. What changes is how we read them: the advice to "widen the correction above 50 degrees" does not hold up once 30°S stops dominating the sum. Next, the programme's history-length table in the paper draft gets restated on the equal-weight score.

Limits: every score is in-sample on 2005 to 2014. The four- and five-season sets share most of their years, so their ranges are narrow by construction. The equal-weight score gives each point's own five-year total one vote, so noisy low-distance points count as much as bright ones. ERA5 stands in for the real sun. The model covers one boat, a 50 W payload and calm water at a daily time step.

Code, results and the full log: [`research/marine-hull`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/marine-hull) (`experiments/run_clamp_exponent.py`, `experiments/results_clamp_exponent.txt`).
