---
title: "How long a series do you need before a slope change counts?"
date: 2026-11-04
description: "A fixed bar for growth-rate breaks reports false alarms on one in seven short, sticky series. A bar set by length and autocorrelation fixes most of it."
tags: [changepoint-detector, statistics]
---

# How long a series do you need before a slope change counts?

The changepoint detector tests whether a growth rate changed by looking at the
period-to-period differences, where a slope change is a shift in the mean. The
test statistic is the largest Wald value over all split points, and until today
it was compared with one fixed bar: 11.

That bar was calibrated on series of 100 points or more. On shorter, more
persistent series it is too low. We simulated 1,000 series with no break at all
and counted how often each bar reported one:

| length | autocorrelation | fixed bar 11 | length-and-rho bar |
|---|---|---|---|
| 36 | 0.5 | 13.5% | 7.0% |
| 50 | 0.5 | 10.4% | 6.3% |
| 70 | 0.5 | 8.0% | 6.8% |
| 300 | 0.5 | 1.9% | 3.8% |

The target is 5%. The new bar comes from a grid of null percentiles, 3,000
simulated series per cell, interpolated by length and by the lag-1
autocorrelation of the differences. At length 30 with autocorrelation 0.6 it is
21.6; at length 400 it is 9.7.

It is not exact. Estimating the autocorrelation from the same series leaves the
rate a little high (up to 7%) at lengths 50 to 120. Quarterly US productivity,
the documented 1973 slowdown, still doesn't clear any of these bars. The date
is found, but growth that noisy needs more data than 318 quarters to confirm.

Use it with `slopeBreaks(x, { critical: 'auto' })`. Code, grid and check script
are in `ventures/changepoint-detector/`.
