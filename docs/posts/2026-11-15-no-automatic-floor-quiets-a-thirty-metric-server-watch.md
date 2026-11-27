---
title: "No automatic floor quiets a thirty-metric server watch"
seo_title: "Alert floors on the Server Machine Dataset: a negative result"
date: 2026-11-15
tags: [changepoint-detection, anomaly-detection, monitoring, pre-registration, negative-result]
description: "Pre-registered on 28 real servers: three automatic alert floors that nearly worked on a pump testbed lost 63-86% of labelled incidents on fresh data."
---

> **Update, 2026-11-27:** the watch that ran in your own GitHub account has been [withdrawn](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html). The [in-browser watch](https://marisstella.app/changepoint-detector/#watch-card) and the `watch.mjs` command line remain.

The [changepoint detector's watch](https://marisstella.app/changepoint-detector/watch-a-metric-for-changes.html) checks a growing series after every new point and says when its level changed. With many columns at once it gets noisy, so four earlier rounds tested floors: rules that drop moves too small to matter, with the threshold read off a normal stretch so nobody has to set it by hand. On one pump testbed with 8 sensors and 33 faults, every floor missed the bar narrowly. The bar was at most 2 false alert lines per 100 checks, at most a few faults lost, and alerts landing on faults at least as often as with no floor. A near miss on one testbed could be the testbed's fault, so the next step was data nobody here had scored.

That data is the [Server Machine Dataset](https://github.com/NetManAIOps/OmniAnomaly) (MIT): 28 servers of a large internet company, 38 metrics each, a minute apart for about five weeks, with 327 labelled incident segments in the second half. I committed the rule, the design and my predictions before the run. Each server's watch covered its 27-34 metrics that vary, in hourly steps. The floors were read off the first half of the unlabelled normal period, and false alerts were counted on the second half.

| every metric on the quiet setting | incidents caught (of 309) | false lines per 100 checks | alerts at an incident |
|---|---|---|---|
| no floor | 290 | 75.79 | 23.5% |
| one floor in units of recent spread | 88 | 3.05 | 35.2% |
| the loudest metric split off with its own floor | 106 | 4.25 | 38.7% |
| a floor re-read from recent moves | 42 | **1.24** | 35.3% |

All three floors fail, and not narrowly. The rule allowed losing 17 of the 290 incidents the unfloored watch caught; the floors lost 184 to 248. Only the rolling floor met the false-alert budget. I predicted the unfloored watch would send about 15 false lines per 100 checks. It sent 76, about three every four hours of normal operation, from 30 metrics that move for many reasons nobody labels.

The reason is arithmetic more than design. A budget of 2 lines per 100 checks for the whole watch leaves 3 or 4 lines a server to read a threshold from. That puts the threshold in the far tail of normal moves, where it also silences most real incidents. Two thirds of the incidents last under an hour and are diluted in hourly steps. One floor also broke outright: on counters that sit flat and then step, the "recent spread" is close to zero, and the threshold came out above 10^12.

So the watch now says plainly what it is for: level changes in the few metrics you choose, not anomaly detection across everything on a server. Hand-set floors and dropping columns you don't care about remain the advice. Script, output and tables are in the tool's README under "Round 18".
