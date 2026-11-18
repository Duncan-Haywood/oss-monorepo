---
title: "The alert hint on a second labelled set: 47 real server metrics, three pre-registered tests, three misses"
seo_title: "Changepoint watch on the Numenta Anomaly Benchmark: hint not confirmed"
date: 2026-11-13
tags: [changepoint-detection, monitoring, alerting, anomaly-detection, pre-registration, negative-result]
description: "Pre-registered on 47 real NAB series watched hourly: the alert hint, a drift lead and a new hint rule all missed. Level detectors sat near chance."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) can watch a metric and alert once when it changes. A hint replays your history under each "How eager" setting and suggests one. Every test of that hint so far used the same 23 series from the Turing Change Point Dataset, which earlier rounds had all seen. Those tests kept ending with "a fresh labelled set is the real test".

Today's run used the [Numenta Anomaly Benchmark](https://github.com/numenta/NAB) (MIT licensed): 47 real series from AWS CloudWatch, an ad exchange, a failing industrial machine, NYC taxi counts, Minnesota traffic sensors and Twitter volumes, each with labelled anomaly windows. I wrote three rules and three predictions into [the script](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/changepoint-detector/eval/watch-nab.mjs) and committed them before any scoring run. Then I replayed an hourly watch after every one of 48,163 points.

| setting | alerts per 1,000 hourly checks | share inside an anomaly window | windows reached (of 61) |
|---|---|---|---|
| Quiet (default) | 33.1 | 13.7% | 50 |
| Middle | 52.8 | 12.5% | 52 |
| Wandering level (drift) | 16.8 | 20.5% | 48 |
| the shipped hint | 32.8 | 13.8% | 49 |
| a new hint that can pick drift | 16.9 | 21.6% | 48 |

**All three rules failed on the count of windows reached.** The hint reached 49 windows where plain Quiet reached 50, so it is not confirmed. The page now says so next to every suggestion. Drift reached 48 windows to Middle's 52, so the lead from the last round is dropped. The new hint halved the alerts and raised their precision, but missed one window. NYC taxi decided it: the holiday dips last a day or two, and the drift model absorbs them as ordinary wander.

**The bigger finding was the 11.8%.** That is the share of future hours inside some labelled window. Alerts placed at random would land in a window about that often. The three level settings landed in one 12.5% to 13.7% of the time. On these metrics they reach the anomalies mostly by alerting often, about 0.8 times a day for Quiet. Only the drift model was clearly better than chance, at 1.7 times the chance rate with half the alerts.

That is probably the daily cycle. Server load, traffic and tweet volume rise and fall every day. The round followed its pre-registered design and ran without a seasonal period, so the level detectors saw each morning's rise as a candidate change. The next round is already clear: the same 47 series, now seen, with `--period 24` on the level settings, pre-registered against drift.

Nothing in the default or the hint's rule changed. What changed is that the tool no longer cites only the dataset it was tuned on.
