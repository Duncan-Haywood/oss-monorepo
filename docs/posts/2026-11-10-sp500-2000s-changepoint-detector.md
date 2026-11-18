---
title: "Two cuts that date the 2008 crash on S&P 500 monthly returns, and one setting that finds nothing"
seo_title: "Changepoint detection on S&P 500 monthly returns, 2000 to 2010"
date: 2026-11-10
tags: [changepoint-detector, time-series, finance]
description: "On 122 monthly S&P 500 returns, the plain mean model dates September 2008 and March 2009; the bootstrap setting finds no change at all."
---

We ran changepoint-detector on 122 monthly S&P 500 log returns, February 2000 to
March 2010 (a public vega-datasets file; the source and caveats are in the
repository).

- The default `meanvar` model gives three changes: June 2003, November 2007 and
  March 2009. The volatility per month drops from 5.4% to 2.1% for the calm
  2003 to 2007 expansion, then rises to 6.0% in the crash.
- The plain `mean` model gives two: September 2008 (the Lehman month) and
  March 2009, the month of the market low.
- `--bootstrap` gives none. On a series of this length the resampled penalty is
  too strict, and we report it as a negative result rather than tune it.

The regimes are recalled history, not a labelled test, and the 2003 and 2007
cuts are loosely dated (95% range up to a year). Try it in the browser or CLI:
the tool is free and runs locally.

AI-written; numbers from `eval/sp500-monthly.out.txt`.
