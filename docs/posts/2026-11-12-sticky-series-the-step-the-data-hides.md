---
title: "Sticky series: the changepoint the data itself hides"
seo_title: "Changepoint detection on sticky time series with repeated values"
date: 2026-11-12
tags: [changepoint-detector, changepoint-detection, time-series, random-walk, kalman-filter, negative-result]
description: "Why a real level step goes missing when a series repeats stale values, and why the fix we planned next could not have helped. Pre-registered, with the numbers."
---

Some series repeat themselves. A stale price quote, a sensor that sits still,
a monthly figure nobody updated: the value is copied from the step before. The
[Changepoint Detector](../../ventures/changepoint-detector/)'s wandering-level
model (`--model drift`) reads each flat run as a stretch with almost no noise,
and it cuts at both ends. On a simulated random walk where 40% of the points
are stale repeats and nothing changes, it reports about 35 false changes in
300 points.

Yesterday's runs tried two fixes: drop the repeats, or treat them as missing
observations in the Kalman filter. Both cut the false changes to one or two a
series. Both were declined, because a real 5-unit step in that walk was then
found 46 times in 60, where the shipped model found it 60 times. Today's
question was why, and the test was written down before the simulation ran.

## The repeats hide when the step happened

When repeats cover the step, the model only sees it at the next new value. The
jump there also carries every ordinary step of wander since the last new value.
After k such steps, the 5-unit jump looks like a chi-square of about 25 / k,
and the penalty for a change is 11.4. On 120 fresh series:

| steps since the last new value | found |
|---|---|
| 1 (no repeat at the step) | 39 of 43 |
| 2 | 24 of 36 |
| 3 | 9 of 26 |
| 4 or more | 5 of 15 |

39 of the 43 misses come after a gap of two or more steps. The fitted wander was
not inflated by the step (0.92 against a true 1), so a bad estimate does not
explain the misses. The information is gone. Once the step happens inside a run
of repeats, the series cannot tell one jump from several ordinary steps.

That also settled the next planned idea. A "zero-inflated" model, in which any
point is a stale copy with one shared probability, adds the same constant to
the cost of every possible segmentation. So it picks exactly the changes the
missing-value model picks, and it cannot help. We did not build it.

## Most of the gap was an operating point

The rule that declined the fix compared a model making 35 false cuts against
one making 1.3. Raise the shipped model's penalty until its false-cut rate
matches, and the gap mostly closes. At 40% repeats, the shipped model at twice
its penalty makes the same 1.35 false cuts a series and finds the step 82 times
in 120. The missing-value model finds it 77 times. At 20% repeats the shipped
model is ahead. The pre-registered rule asked the missing-value model to match
or beat the shipped one at every matched rate, and it did not, so nothing
changes for users.

What it leaves is a lead: on a sticky series, the existing model with a doubled
penalty (`--penalty` at 4 log n) may be as good as any repeat model tried. That
came out after the rule was written, so it gets its own pre-registration on real
sticky series before the tool's sticky-series warning may suggest it.

Script, output and predictions: `eval/drift-sticky-why.mjs` and its `.out.txt`
in the venture; the README section is "Why the step goes missing".
