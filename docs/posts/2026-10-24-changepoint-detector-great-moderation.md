---
title: "Can a changepoint detector find the Great Moderation? A real-data check, and a default that fails it"
date: 2026-10-24
description: "Our free changepoint detector finds the documented 1984 US GDP volatility drop, but its default reports a five-quarter calm patch and a range missing the date."
tags: [changepoint-detector, evaluation, time-series, real-data]
---

Economists date a sharp fall in the volatility of US output growth to 1984Q1
(McConnell and Perez-Quiros, 2000), the "Great Moderation". It is a good test
for a changepoint tool because the answer is published and the data is public
domain: quarterly real GDP growth from statsmodels' `macrodata` set, 202
quarters, 1959Q2 to 2009Q3. Growth has a standard deviation of 4.34 points
before 1984Q1 and 2.04 after, to 2007Q4.

We ran [changepoint-detector](../../ventures/changepoint-detector/README.md)'s
`--model meanvar` (PELT on level and volatility):

| Minimum segment | Changes | Near 1984 | Range holds 1984Q1? |
|---|---|---|---|
| 5 (default) | 3 | 1983Q2 (sd 4.32 to 0.75), 1984Q3 (0.75 to 1.97) | No: "1984Q3, that point only" |
| 12 | 2 | 1984Q3 (sd 4.33 to 2.00) | Yes, 1984Q1 to 1985Q4 |
| 20 | 2 | 1984Q3 (sd 4.33 to 2.02) | Yes, 1983Q3 to 1985Q4 |

The break is found. But with the default, the detector prefers to carve out a
five-quarter patch of unusually similar numbers (sd 0.75) rather than one clean
drop, and then reports a one-quarter "95% range" for the end of that patch that
excludes the documented date. A variance model rewards short quiet runs, and
quarterly macro data has too few points per regime to push back. A longer
minimum segment fixes it here. This is one series, so we have not changed the
default; the open question is whether `meanvar` should warn when a segment is
shorter than about ten points.

Two other things the same data showed. `--model mean` reads recessions as 12
level shifts, and the autocorrelation correction (`--ar1`) is for the mean model
only. And on the level of log GDP, no setting gives a trustworthy slope-break
answer: the series is close to a unit root (residual autocorrelation 0.96), the
old Perron versus Nelson and Plosser argument, so we make no claim there.

The eval script, data file with its source, and a test that pins these numbers
are in the repository (`eval/great-moderation.mjs`). Try your own series in the
[browser tool](https://duncan-haywood.github.io/oss-monorepo/changepoint-detector/);
nothing is uploaded.
