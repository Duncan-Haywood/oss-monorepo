---
title: "Where should a Wave Glider sail? In winter it barely matters, in summer it matters a lot"
seo_title: "Wave Glider km/day by site and season with a heave-velocity speed law"
date: 2026-11-11
tags: [research, marine-hull]
description: "Re-planning a Wave Glider's daily distance at 11 NOAA buoys with speed ~ (Hs/T)^0.53: January sites plan 52 to 59 km/day, July sites 32 to 55, and the calm-sea end is an extrapolation."
---

Earlier posts followed one fielded Wave Glider, the "Honey Badger" that sailed from Hawaii in 2015, and asked how far such a vehicle would go per day at eleven NOAA buoys around the US in 2024. The first answer was "about 30 to 61 km/day, set mostly by the vehicle, not the site". That rested on a speed law fitted against wave heights from a buoy often 100 to 300 km from the vehicle.

The previous milestone found that this buoy match hid most of the signal. The vehicle carried its own wave sensor. With those on-board waves, speed scales roughly as (Hs/T)^0.53, a sub-linear power of wave height over wave period, which is close to how fast the float is pushed up and down. So we re-ran the plan with that law. Each 2024 buoy's own average period (NDBC's APD) went in, and the predictions were written down before the run.

What changed:

- **January: the site matters less than we said.** The best buoy over the worst falls from 1.20 to **1.12**. The Pacific buoys have the biggest seas (2.3 to 2.6 m median), but also the longest periods (8 to 9 s), so their heave velocity is about the same as the Atlantic and Gulf's. Every January buoy plans 52 to 59 km/day at the vehicle's best month. We had predicted the site spread would widen in both seasons. It narrowed in winter, so that prediction failed.
- **July: the site matters as much as the vehicle.** The best buoy over the worst rises from 1.34 to **1.73**, slightly above the vehicle's best-month-over-worst ratio of 1.68. Calm, short seas in the Gulf of Mexico and off Nantucket (about 0.4 m, 4 s) plan 32 to 35 km/day, against 48 to 55 in the Pacific.
- **The vehicle's share of the variation falls** from 82% to 66%, and season's share rises from 6% to 15%.
- **Fleet medians:** 55 km/day (January) and 45 km/day (July) at the vehicle's best month, 33 and 27 at its worst. All of them stay below the 86 km/day ceiling of a deck-solar boat from earlier in the programme.

The catch is that the July low end is an extrapolation. The vehicle sailed in Hawaiian seas. At the three slowest July buoys, 88 to 95% of hours sit below the 5th percentile of anything it saw in heave velocity. We checked the law at the bottom of the mission's range after the fact: it holds to within about 10% down to Hs/T of 0.12 m/s, but only 35 mission hours were below 0.15. Those are exactly the seas the slow-site plans need. Calibrating the on-board sensor against buoys within 150 km shifts every row by about +5%, and fitting height and period separately instead of as a ratio changes the medians by under 1.5%.

For a planner the advice splits by season. In winter, carry the vehicle's logged speed and ignore the site. In summer, the site's wave height over period matters about as much, but the calm-sea figures are a region of uncertain size, not a number, until a second vehicle that sailed in calm, short seas is in the data.

The code, data, pre-registered predictions and results are in `research/marine-hull/` (milestone 6v, `experiments/run_waveglider_site_period.py`).

*Written with AI assistance (Claude Code).*
