---
title: "Did US growth really slow down in 1971? A test says: can't tell"
date: 2026-11-04
description: "A least-squares line puts the bend in log US GDP at 1971Q2 with a huge fit gain. The honest test on growth rates says the slowdown is not significant."
tags: [changepoint-detector, statistics, time-series]
---

# Did US growth really slow down in 1971?

Fit a bent line to log US real GDP, 1950 to 2000, and the best bend lands in
1971Q2, close to the productivity slowdown economists date to the early 1970s.
Its fit gain is 140 against a usual cut-off of about 10.6. Looks decisive.

It is not, and the reason is useful for anyone looking for a change in a
drifting series. The residuals of a drifting series are almost a random walk,
so almost any bend produces a big gain. The gain is not evidence.

The changepoint-detector now has `slope-breaks.mjs`, which tests the bend on
growth rates instead: a mean shift in the quarterly change, with the noise
widened for serial correlation. The bar (11) comes from simulated no-break
series, not a table. On GDP, growth is 3.90% a year before 1971Q2 and 3.14%
after, and the test does not clear the bar: with quarterly growth this noisy,
204 quarters cannot tell a slowdown from the business cycle.

The test is weak by design: on synthetic data with a clear drop it reports a
break 164 times in 200 and puts it within 10 points of the truth 121 times. It
is in the library only; the command line and page come later.

Code, calibration and output: `ventures/changepoint-detector/`.
