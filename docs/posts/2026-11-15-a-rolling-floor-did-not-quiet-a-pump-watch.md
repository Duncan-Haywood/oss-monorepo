---
title: "A floor that resets every five minutes did not quiet a pump watch"
seo_title: "Rolling alert floor on SKAB: 32 of 33 faults, too many false alerts"
date: 2026-11-15
tags: [changepoint-detection, anomaly-detection, monitoring, pre-registration, negative-result]
description: "Pre-registered: alerting only on moves bigger than anything a sensor did in the last five minutes caught 32 of 33 pump faults, with 4.67 false alerts per 100."
---

> **Update, 2026-11-27:** the watch that ran in your own GitHub account has been [withdrawn](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html). The [in-browser watch](https://marisstella.app/changepoint-detector/#watch-card) and the `watch.mjs` command line remain.

The [changepoint detector's watch](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html) checks a growing series after every new point and says when its level changed. Watching eight sensors on a water pump at once is too noisy, so the last few rounds have tested floors: rules that drop moves too small to matter. All of them were tested on the [Skoltech Anomaly Benchmark](https://github.com/waico/SKAB), with 33 recorded pump faults and one normal run. The bar has stayed the same each time: at most 2 false alert lines per 100 checks on the stretches before each fault, at most 2 faults lost, and a share of alerts landing on a fault no lower than with no floor.

Rounds 14 to 16 read their floors off the normal run, which was recorded on a different day from the faults. Each one missed because a sensor behaved differently on the fault days, usually the motor temperature. So round 17 read nothing from another day. Its rule: alert only on a move bigger than any move the same sensor made in the five minutes before it (the largest gap between neighbouring one-minute averages). The idea was that a new day's drift would reset the floor by itself.

| every sensor on the quiet setting | faults caught | false lines per 100 pre-fault checks | alerts at a fault |
|---|---|---|---|
| no floor | 33/33 | 6.34 | 36.8% |
| **rolling floor (the test)** | **32/33** | **4.67** | 38.4% |
| rolling floor, threshold read off the normal run (reported only) | 29/33 | 1.50 | 55.2% |

It fails. The faults held up, but the false alerts stayed more than twice over budget. I had predicted a failure at about 3.0. The idea was wrong about the temperature: on the fault days its moves were a little bigger than its recent wander (median 1.07 times), not the slow drift a rolling window would absorb. Only 16% of its alerts landed on a fault. The thermocouple did the reverse: sharp steps on the normal day, ordinary wander on the fault days.

Over five rounds the floors have landed on both sides of the bar without meeting it: 28 faults at 2.27, 27 at 1.40, 30 at 2.47, and now 32 at 4.67. Changing the floor's shape mostly moves the result along one trade-off between missed faults and false alerts. So the watch's advice stays practical: replay your history first, put a hand-set floor on the loud sensors that don't matter or drop them, and leave the sensor that sees the problem alone. The next useful test is a fresh labelled multi-sensor dataset, not a sixth floor on this one.

The rule and predictions were committed before the run. Script, output and tables are in the tool's README under "Round 17".
