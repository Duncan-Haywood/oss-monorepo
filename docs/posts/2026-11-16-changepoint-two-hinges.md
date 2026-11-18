---
title: "A second bend for the slope test: more power, and an honest no on short sticky series"
seo_title: "Testing two changes of slope in a short time series"
date: 2026-11-16
tags: [changepoint-detection, statistics, pre-registration, trend-breaks]
description: "A two-hinge slope test passed every pre-registered size and power bar. Its random-walk guard still turns away the short sticky series it was built for."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) has a test for one change of slope: does a series run along one straight line, or does it bend once? On annual global temperature it finds the mid-1970s acceleration with p 0.001. On most short real series, though, it gives no answer. Seven of the eight real series under 100 points that I ran through it were refused.

It refuses because of a guard. If the residuals about a line are too sticky (each year very like the last), the series may be a random walk, and a random walk will "bend" for a level test almost every time. On those series the residuals were still sticky after the best single bend was taken out. Australian gas production and US electricity use speed up and then level off. The US female murder rate rises, holds and falls. Those shapes have two bends, and one hinge leaves the second in the noise. So the obvious next step was a test with two hinges.

## What I wrote down first

The test is the one-hinge procedure with a second knot. It looks at every pair of knot positions and takes the largest F against a straight line. It assumes AR(1) noise and gets its p-value from a bootstrap that reruns the whole search on simulated straight lines. The guard works the same way as the one-hinge guard. A sticky series is admitted only if the two bends cut its stickiness by more than 99% of random walks of the same length are cut.

Before running anything on real data or fresh seeds, I committed the bars and predictions ([pre-registration](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/changepoint-detector/eval/two-hinge-prereg-2026-11-16.md)):

- **Size:** at most 8% false rejections on straight lines with AR(1) noise, in all 12 cells (n 40, 60, 95; rho 0 to 0.8).
- **Unit roots:** at most 8% on random walks and near-unit-root series, in all 9 cells.
- **Power:** on a flat, rising, flat curve at 60 points, at least 10 percentage points more rejections than the one-hinge test.
- Seven predictions about real series, written down before any of them was run.

## What happened

All 21 size cells held, from 2.3% to 7.3% on lines and at most 3.7% on walks. Power held clearly. On the plateau curve the two-hinge test rejected in 31% of series and the one-hinge test in 7%. At 95 points the figures were 46% against 2%. On a series the shipped test already admits, a second knot finds shapes the first one misses. So it ships as `--two-hinge-test`, with a box on the page.

Six of the seven real predictions held. One of the six said annual global temperature 1880-2024 would be tested and get a knot in 1965-1985. It did: knots in 1904 and 1985, p 0.002. The one-hinge answer, 1976, falls between them, as a compromise between the early-century warming and the late acceleration.

## The part that didn't work

The series that motivated the test are still refused. The second bend does cut their stickiness: gas from 0.83 to 0.47, fertility from 0.77 to 0.61, the murder rate from 0.80 to 0.68. But a second bend cuts a random walk's stickiness about as much. Two bends can trace most of a short walk's wander. So the bar the cut has to clear rises with it, to 0.90 at 39 points and 0.65 at 55. The murder rate was my one wrong prediction: its cut was 0.29 against a bar of 0.65.

I don't count that as a failure of the guard. The guard is the reason the walk cells stayed under 4%. Any rule loose enough to admit the gas series would also admit walks. What the result says is that under about 60 points, a different shape won't separate these series from walks. Information from outside the data will. If you know the date the regime changed, the test doesn't have to search for the knot, and a fixed-knot test needs a far smaller null. That is next.

One warning carries over from the one-hinge test. A level step can pass for bends. On the Nile, the two knots fall in 1892 and 1907, making a 15-year plunge that stands in for the 1898 drop. The report says so and asks you to run the step models too.

Numbers, scripts and the full table: the project [README](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/changepoint-detector/README.md), "Two changes of slope". These are statistical estimates, not advice.
