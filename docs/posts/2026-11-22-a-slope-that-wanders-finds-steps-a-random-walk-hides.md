---
title: "A slope that wanders: a smooth-trend changepoint model on 21 series the random walk fits badly"
seo_title: "A smooth-trend changepoint model on 21 hard series"
date: 2026-11-22
tags: [changepoint-detector, statistics, time-series]
description: "A changepoint model with a level that carries momentum gained 0.028 F1 on 21 TCPD series where our random-walk model floors its noise. Bar 0.03: it stays off."
---

Our [change detector](https://marisstella.app/changepoint-detector/) has a drift model. Between changes the level wanders as a random walk, so a series can drift slowly without that drift being reported as a staircase of jumps. To size the walk it fits a line through the variances of lag-k differences. On a random walk plus noise that line is straight, and its intercept is twice the noise variance.

On 21 of the 38 labelled series in the Turing Change Point Dataset the line bends upward instead. The intercept comes out below zero and the noise estimate falls back to a numerical floor. A level that keeps moving in one direction, then turns, looks like this. A random walk has no momentum, so it is the wrong model for these series.

This run added the textbook model for that shape: a smooth trend. The level moves by a slope, the slope itself wanders, and a change restarts both. The noise and the slope's wander are sized from lag-k second differences, whose variance under this model is 6σ² + ζ²·k(2k²+1)/3. Because the filter's variances don't depend on the data, the exact optimal partition still costs O(n²).

The rules were written before the first run:

- **On smooth series with no change, it makes 0.005 false cuts a series.** The random-walk model makes 0.14 when the slope wanders slowly and 3.1 when it wanders fast. Passed.
- **Power for a 4-σ step:** it finds 92% of steps when the slope turns slowly but only 38% when it turns fast, against a bar of 50%. A slope that turns fast can bend round a step. Failed.
- **On the 21 floored series, F1 rises from 0.605 to 0.633.** The bar was +0.03, so it missed by 0.002. Failed. It wins on 10 series and loses on 8. The wins include Iran's GDP (9 cuts down to 2, +0.32) and a quality-control series that it now cuts once, at the labelled step.
- **On the five held-out floored series it gains 0.060.** Passed.

Two lines failed, so by our own rule nothing changes in the tool. The model is exported for later rounds.

One pattern turned up after the run, and it doesn't count as a result. On four series the smooth-trend fit floors its noise too, and three of those four are among the losses. On the other 17 floored series the gain is +0.063, with 10 wins and 4 losses. We picked that routing rule after seeing these series, so the only fair test is on series it hasn't seen yet. That is the next run's job.

Details, the per-series table and the script: the changepoint-detector README, "Jumps on a smooth trend", and `eval/trend-walk-floored.out.txt`.
