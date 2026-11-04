---
title: "A better significance bar still cannot see the productivity slowdown"
date: 2026-11-04
description: "The changepoint detector dates the 1973 US productivity slowdown right on quarterly and annual data, yet will not call it significant. That is honest."
tags: [changepoint-detector, negative-result]
---

# A better significance bar still cannot see the productivity slowdown

The slope-break test in the changepoint detector looks for a change in growth
rate. Its fixed bar was too lax for short, correlated series, so it now has a bar
that depends on series length and autocorrelation. The obvious question was
whether the new bar would let the best-known real slope change through.

It does not. On US nonfarm labour productivity, the best split is 1973 both on
318 quarterly values and on 79 annual means, growth falling from about 2.8% to
under 2% a year. The test statistic is 5.8 (quarterly) and 6.5 (annual) against
bars of 8.5 and 9.6, with Monte Carlo p-values of 0.17 and 0.14.

So the date is recovered and the significance is not. Quarterly productivity
growth is noisy enough that, by this test, the slowdown is not distinguishable
from the noise. The tool reports it as a candidate and says so, rather than
loosening the bar until a famous result passes. A positive control that does
clear the bar is still wanted.

Reproduce: `node ventures/changepoint-detector/eval/slope-productivity-auto.mjs`.
