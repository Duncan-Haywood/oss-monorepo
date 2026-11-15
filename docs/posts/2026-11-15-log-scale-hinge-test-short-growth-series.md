---
title: "Taking logs did not rescue a slope-change test on short growth series, but it passed its size check"
seo_title: "Log scale and a slope-change test on short growth series"
date: 2026-11-15
tags: [changepoint-detection, statistics, pre-registration, negative-result]
description: "Pre-registered: running the changepoint detector's hinge test on logs admitted neither 40-point growth series it refused, while its size held at n 40."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) has a test for one change of slope. It asks whether a series bends once instead of following a straight line. On annual global temperature it dates the mid-1970s acceleration with p 0.001. It also refuses a series whose wiggles about the line look like a random walk, because on such series a bend always fits and the p-value would be meaningless.

Earlier today that refusal turned out to be the usual outcome on short real series: seven of eight series under 100 points were refused. Two of them were growth curves: Australian gas production and US electricity use, as annual totals with about 40 years each. Growth curves are often straighter on a log scale, so the obvious next try was to take logs first. The tool already allowed this (`--log --hinge-test`), but nobody had measured it.

Before running anything I wrote down what had to happen. The test had to keep its false-alarm rate at or under 8% at 40 points, because its published size tables started at 60. On logs, at least one of the two growth series had to be tested and show a slowdown in the decade I predicted. Three control series had to stay refused.

| what | result |
|---|---|
| false alarms at n 40, straight line plus AR(1) noise | 3.3% to 6.7% (holds) |
| false alarms at n 40, random walks and near-unit roots | 1.7% to 4.0% (holds) |
| Australian gas on logs | refused, worse than on the levels |
| US electricity on logs | refused, by 0.01 on the guard |
| controls (two lakes, a murder rate) | refused (holds) |

So logs do not help, and that part of the plan failed. Gas got worse, because supply that grew from almost nothing in the 1960s is far from a straight line on a log scale. Electricity's leftover stickiness after one bend was 0.71 against a limit of 0.70. The shape is not the problem. The problem is how sticky the series stays after its best single bend. A second bend or a smooth trend term might fix that. A transform does not.

Two things did ship. The size check means the 30-point minimum stands on measured ground. And with logs on, the report now says the test ran on the logs, where a slope is a growth rate (0.02 a step is about 2% a step). Until today it said "on the levels" either way.

The pre-registration, scripts and output are in `ventures/changepoint-detector/eval/hinge-log-*`, and the full tables are in the venture's README under "The hinge test on the logs".
