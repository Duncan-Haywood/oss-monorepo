---
title: "A solar boat's learned sun correction works best held to ±5%, unless it plans and sails on different data"
seo_title: "Solar USV sun correction: how tight to clamp it"
date: 2026-11-17
tags: [research, marine-hull]
description: "Sweeping the clamp on a solar boat's one-season sun correction: ±5% beats no correction on all 30 points, but a plan-sea mismatch wants it wide."
---

A solar survey boat plans its battery use from a sunlight climatology. With one season of its own log it can correct that climatology month by month: logged harvest over planned harvest. Since we started this line we have capped each learned month ratio at ±15%. We chose that number once and never tested it. The [last step](2026-11-16-marine-hull-solar-boat-season-not-level.md) found the cap binding when the boat plans on one sunlight product and sails under another, and one wider cap (±30%) helped there. That cap was picked after we saw the problem, and we only scored it at nine high-latitude points.

So this step swept the cap from ±5% to ±40%, seven values written down before the run with ten predictions. We scored it on all 30 ocean points, and at the nine high-latitude points in four worlds: NASA POWER throughout, ERA5 throughout, plan on NASA and sail on ERA5, and the reverse. A case is a battery size, a half-decade and one of 21 climatology error shapes. The boat wins a case when it travels at least as far as a 7-day trailing-mean baseline with no more hours running dark.

- **On all 30 points, tighter is better.** At ±5% the correction wins 151.4 of 168 cases on average over the five possible learning years. With no correction the boat wins 139. Every one-season rule we had tried before fell short of 139 on this count. At our old ±15% it was 121.8, and from ±20% outward it sits at 117.6, because above ±20% almost no learned ratio reaches the cap.
- **Why:** the tight cap mostly removes the dark-hour failures. One learned year is noisy, and an unshrunk correction makes the boat too bold in months that happened to be bright. Capping it is shrinkage under another name, and it agrees with our earlier finding that shrinking a correction toward the climatology helps on ordinary water.
- **At high latitude the tight cap keeps most of the gain.** At the nine points it scores 60.0 against no correction's 25 (81.0 at ±15%). We had predicted it would lose more than half the lead. It lost about a third.
- **With mismatched data the answer flips.** When the boat plans on NASA and sails under ERA5, the score rises with every widening, from 22.2 at ±5% to 62.4 at ±40%. There the learned error is real and large, and a tight cap throws it away.
- **No single cap is safe everywhere.** Every width is at least 23.8 cases below the best in at least one of the five settings.

For a designer: if your climatology and the sun your panels see come from the same source, hold a one-season correction to about ±5%. If they don't (and a real boat's climatology never matches the real sun exactly), the cap should be wider. A boat could pick its cap from how far its own learned ratios sit from 1. That rule is our next test.

Limits: ±5% is the best of seven values scored on the same years, so 151.4 is a selection, not an out-of-sample result, and its worst learning year (138) dips one case below no correction. Scored point by point on the real climatology it still trails no correction (124.2 against 126 of 240). ERA5 stands in for the real sun. One learning year, one boat, a 50 W payload and a calm-water daily model.

Code, results and the full log: [`research/marine-hull`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/marine-hull) (`experiments/run_clamp_sweep.py`, `experiments/results_clamp_sweep.txt`, figure `experiments/clamp_sweep.svg`).
