---
title: "Outliers or a wild random walk? A robust changepoint cost that failed, and why"
seo_title: "Robust changepoint costs on heavy-tailed series: when biweight helps"
date: 2026-11-11
tags: [changepoint-detector, statistics, time-series, changepoint, robust-statistics, negative-result]
description: "A biweight cost was pre-registered to fix false changes on heavy-tailed series. It lost on the benchmark, and the reason shows where heavy tails can live."
---

The [changepoint detector](../../ventures/changepoint-detector/) has a model for
series whose level wanders between real jumps (`--model drift`). On the Turing
Change Point Dataset (TCPD) it still marks a lot of changes on a few series: 63 on
`bank`, where every annotator marks none, and 52 on bitcoin. The usual fix for heavy
tails is a robust cost, which caps how much a single wild point can cost so it can't
pay for a change. So we wrote one down before running it: a biweight cost (Fearnhead
and Rigaill's outlier loss, put inside the model's Kalman filter), clipped at 3
standard deviations. It would become the default if it beat the current cost on both
the 31 shipped TCPD series and the 7 held out.

## It lost

| | F1, 31 shipped | F1, 7 held out | cuts on bank | cuts on bitcoin |
|---|---|---|---|---|
| Gaussian cost (default) | 0.694 | 0.527 | 63 | 52 |
| biweight, c = 3 (pre-registered) | 0.677 | 0.441 | 111 | 96 |
| Huber, c = 1.345 | 0.699 | 0.512 | 87 | 71 |

On the two series it was meant for, the biweight nearly doubled the false changes.

## Why: the tails were in the walk, not the noise

The model splits a series into noise around a level and the level's own random-walk
steps. On `bank` and bitcoin the noise around the level is at the fit's floor: both
read as pure random walks. Their heavy tails (the day-to-day changes have kurtosis
19 and 42, against 3 for a normal distribution) come from the walk's own steps.

In a random walk, a jump in level is just one big step. No cost on the observations
can tell "a change" from "a large step that a heavy-tailed walk takes now and then".
The biweight made it worse in a specific way: rejecting a point costs a fixed amount,
so the best fit became a flat level with many rejected points and many cuts. The
estimated wander dropped to zero.

Where the heavy tails really are outliers around a level, the robust cost works.
TCPD's `well_log`, the textbook outlier series, went from 21 cuts to 15 and F1 from
0.764 to 0.874. A synthetic check, where the truth is known, gives the same split
(400 points, 60 series a cell, Student t tails with 3 degrees of freedom):

| | false cuts, Gaussian cost | false cuts, biweight |
|---|---|---|
| heavy-tailed noise around a flat level | 3.00 | 0.05 |
| heavy-tailed random walk, no noise | 17.40 | 18.08 |

## What shipped

- `--drift-loss huber|biweight`, off by default because the pre-registered rule failed.
- A heavy-tail check in every `--model drift` result. It says **walk** when the
  series reads as a random walk with heavy-tailed steps (the jumps may just be its
  largest steps; try `--model meanvar` on the differences to look for changes in how
  much it moves) or **noise** when the tails are outliers around a level (try
  `--drift-loss biweight`). The kurtosis bar of 6 was set after looking at TCPD, so
  the TCPD figures for the check are in-sample. Using biweight only where the check
  says "noise" would score 0.701 and 0.527. That is worth testing on fresh labelled
  data, and it is not evidence for a default yet.

Every number here is in the venture README ("Heavy tails on a drifting level") and in
the scripts under `eval/` that produced it. Statistical analysis of data you supply,
not advice.
