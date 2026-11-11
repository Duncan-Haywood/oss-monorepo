---
title: "A sensor that sits still broke our robust noise estimate"
seo_title: "Changepoint detection on sticky sensor data: when the MAD is zero"
date: 2026-11-11
tags: [changepoint-detector, time-series, negative-result]
description: "A room sensor that sits still for 65% of readings made our drift changepoint model read every move as a change. Fixed: 86 false cuts down to 23."
---

This run set out to answer a narrow question about our
[changepoint detector](../../ventures/changepoint-detector/): does the
*drift* model, where the level may wander as a random walk between jumps,
help when you hand it several columns at once? The answer was mostly no. The
more useful thing turned out to be a bug it found along the way.

## The multi-column drift model, and the rule it had to pass

With one column, the drift model stops a smooth series being cut into a
staircase (US population: 406 cuts with flat segments, 1 with a wandering
level). The new code gives every column its own noise and wander sizes and
fits one set of changes shared by all of them. With a single column it gives
exactly the one-column model's answer, and a test checks that.

Before running it on anything, we wrote down what it had to do to be offered
in the CLI. It had to beat the current joint fit on the three labelled
multi-column series in the Turing Change Point Dataset (a stock's price and
volume, a dancing bee's position and heading, four room-occupancy sensors).
In simulation it also had to keep the joint fit's power on small steps in
plain noise.

It failed both parts:

| | joint level fit (default) | joint drift fit |
|---|---|---|
| TCPD mean F1, three series | 0.286 | 0.245 |
| false cuts, wandering columns, no step (d = 1/2/4) | 3.0 / 3.8 / 4.8 | 0.25 / 0.15 / 0.12 |
| 1 sd step in white noise found (d = 1/2/4) | 90% / 90% / 97% | 43% / 63% / 85% |

When the columns wander, the joint drift fit makes 12 to 40 times fewer
false cuts. But it pays for that in power: a model that lets the level wander
can explain a small step as wander. So it is not offered. The library function
and both scripts stay in the repository as a measured baseline.

## The bug: a median of zero

One occupancy column looked wrong. Its noise came out as **0.000001**,
measured in the sensor's own units. The column is 0 on 329 of its 508
differences: the sensor sits still most of the time. The drift model sizes
its noise from the *median* absolute difference between readings, which is a
good robust choice until more than half the differences are exactly zero.
Then the median is zero, the noise drops to the numerical floor, and every
move the sensor makes looks like a change.

Our flat-segment model already had a fallback for this case: use the plain
variance of the differences. The drift model didn't. Now it does, and on
that column alone `--model drift` goes from **86 cuts to 23** (F1 against the
annotators 0.418 to 0.724). None of the other 38 labelled series we score the
drift model on has this problem, and all 38 results came out byte-identical
after the fix. That is the check that it changes only what it should.

Readings that stick like this are common: a sensor that reads zero at night,
a shop's sales on days it is closed, a price that only moves when someone
trades. If your data has long flat runs, the fix matters to you.

## What's next

With the fix the joint drift fit reaches 0.334 on the three series. That
beats the default, but we saw the series before making the fix, so it counts
as a lead rather than a result. Its real weakness is visible in the stock's
trading volume: bursts of volatility read as jumps (20 of 30 cuts fall in one
busy stretch). A drift cost that tolerates volatility bursts is the next step,
along with fresh labelled multi-column data to test the leads on.

Details, numbers and the pre-registered rules are in the venture's README
under "The drift model on several columns". The detector is free and runs in
your browser. Its results are estimates, not advice.
