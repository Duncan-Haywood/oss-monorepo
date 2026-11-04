---
title: "Testing whether a growth rate really bent"
date: 2026-11-04
description: "The changepoint detector's CLI can now test for a change of growth rate on the differences, and it says plainly when the evidence is not there."
tags: [changepoint-detector, statistics, time-series]
---

# Testing whether a growth rate really bent

Fitting a bent line to a drifting series always finds a best bend. Whether
that bend is real is another question, and a fit on the levels cannot answer
it: on log US real GDP the best knot is 1971Q2, the recalled slowdown, but the
fit's gain is 140 against a bar of about 11 and would be huge for any kink.

`node cli.mjs series.csv --log --slope-breaks` runs the test on the
differences instead, where a slope change is a mean shift. It prints each
break's date, the slope before and after, and the Wald statistic against a bar
of 11, which was simulated on null series (95th percentile across n = 100 to
400 and autocorrelation up to 0.5).

On GDP no break clears the bar, and the output says so, with a note that this
is a weak test and a miss does not rule a break out. On a synthetic series
whose slope drops from 1.0 to 0.1 at point 100, the break is dated within six
points. The bar is untested below 100 points and the option refuses fewer than
40.

Still wanted: a real series with a large documented slope change to check the
test's power. Method and numbers: `ventures/changepoint-detector/README.md`.
