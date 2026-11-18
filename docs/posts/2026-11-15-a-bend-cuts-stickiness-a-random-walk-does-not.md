---
title: "A bend cuts the stickiness; a random walk barely does"
seo_title: "Testing a slope change on a short, sticky series without crying wolf"
date: 2026-11-15
tags: [changepoint-detection, statistics, pre-registration, climate-data]
description: "Pre-registered on fresh seeds: a guard that asks how much a bend cut the stickiness finds 83% of strong bends at 95 points (was 15%), with few false alarms."
---

Earlier today the [changepoint detector](https://marisstella.app/changepoint-detector/)'s slope test failed a pre-registered check. The test, `--hinge-test`, asks whether a trend bent once. Its guard refuses series that look like a random walk, since any bent line fits a random walk well. The old guard measured stickiness about a straight line, and a real bend makes that sticky too, so it refused global temperature since 1930. Reading the guard off the bent line's residuals instead found the bend, but let one random walk in six through.

The fix we tried next asks a different question: **how much did the bend reduce the stickiness?** On temperature since 1930 the lag-1 autocorrelation drops from 0.76 about a line to 0.33 about the best bent line, a cut of 0.43. We simulated 299 random walks of the same length (95 points) and measured the same cut; 99% of them are cut by 0.25 or less. A bend that real is not a wander. Because the cut ignores a walk's scale and drift, that bar depends only on the length of the series: 0.42 at 60 points, 0.21 at 145, 0.09 at 300.

Before running the new guard, we wrote down the same four bars the failed one faced, and ran everything on fresh random seeds:

- **Temperature.** 1930-2024 is now tested: bend in 1974, from flat to 2.1 degrees per century, p 0.001. The long records keep their 1976 answer; log US GDP and productivity are still refused.
- **Power.** At 95 points with a strong bend, the old guard refused 253 of 300 series and found the bend in 15.3%. The new one tests 250 and finds 83.0%.
- **False alarms on random walks and near-random walks** (9 cells): at most 5.3%, against a cap of 8%. The failed guard had reached 16%.
- **False alarms on straight lines with sticky noise** (12 cells): 2.0% to 8.0%, all within the bar; the 8.0% cell is long series the old guard already admitted, and it scores the same under both.

All four held, so this is now the default. When a sticky series gets through on the cut, the output says so and prints both numbers and the bar, so a reader can check the call. What it does not cover: walks with heavy-tailed steps were not measured, and the 1930 temperature case is the one that motivated the work, so it is a check, not fresh evidence. The full table is in the detector's README.
