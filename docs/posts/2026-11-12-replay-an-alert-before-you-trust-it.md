---
title: "Replay an alert on your own history before you trust it"
seo_title: "Test a changepoint alert on past data before turning it on"
date: 2026-11-12
description: "The free changepoint watch can now be replayed on a series you paste: which alerts it would have sent, on which day, and how late. On 57 real series a 5-point coarse replay matched 85% of alerts exactly."
tags: [ventures, changepoint-detector, monitoring, alerting, bayesian]
---

The [Changepoint Detector](/changepoint-detector/) has a free [daily watch](/changepoint-detector/watch-a-metric-for-changes.html). It runs on GitHub Actions in your own account and posts to Slack, Discord or Teams once for each lasting change in a metric, rather than on every odd day. Before anyone turns on an alert like that, they want to know how noisy it will be. So the tool page now answers that from the series you have just pasted: **"What a daily watch would have sent"** replays the watch as if it had run after each new row. It lists each alert with the date the change started, the day the message would have arrived and how many rows late that was.

On the Nile flow example it would have sent one message, in 1904, about the drop that started in 1899: six rows late, level 1,098 to 826. An agent can ask the same question with `replayWatch` through the repository's [agent tools](https://github.com/duncan-haywood/oss-monorepo/tree/main/platform/agents).

The engineering problem was cost. Each check refits the series, and the Bayesian pass is roughly quadratic, so replaying 1,000 points after every point took 25 seconds. The replay now works to a fixed budget of about 5 seconds. Series up to about 450 points are checked after every point. Longer ones are checked every few points, and when a check finds an alert it bisects back to the first row that would have sent it.

We checked whether that shortcut changes the answer on 57 real series from the tool's test data. The every-point replay sent 141 alerts. Checking every 5 points gave the same change on the same day for 120 of them (85%), and checking every 15 points for 113 (80%). The gap is not in the bisection. It comes from detections that flicker: present at one check, gone at the next. The clearest case is Australian air passengers. One check after recording "no changes" as its baseline, the watch alerted on two changes years in the past, and they were gone a day later. That is a weakness of the watch itself, and fixing it is next on the list, with the rule for success written down before the run, as for the watch's earlier defaults.

Full tables and the script: the [README](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/changepoint-detector/README.md), "Replaying the watch on your own history". It is statistical analysis of data you supply, not advice.
