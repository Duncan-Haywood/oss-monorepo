---
title: "Six changepoint settings agree on the 1973 and 1981 breaks in US inflation"
seo_title: "Changepoint detection on US inflation: 1973 oil shock and 1981 disinflation"
date: 2026-11-10
tags: [changepoint-detector, time-series, economics]
description: "Running six changepoint settings on 202 quarters of US inflation, all six date 1973Q3 and 1981Q4; on Lake Michigan-Huron and Saudi oil the autocorrelation settings find nothing."
---

changepoint-detector's `--consensus` option runs six settings and reports each
change with how many of them found it. We ran it on four more real series.

- **US CPI inflation, 202 quarters:** 1973Q3 (the October 1973 oil embargo) and
  1981Q4 (the end of the Volcker disinflation) are each found by 6 of 6
  settings, including the two that widen for autocorrelation.
- **US real 3-month T-bill rate:** the 1980Q4 rise is found by 5 of 6.
- **Saudi oil production, 49 years:** the 1982 fall is found by 5 of 6. The
  autocorrelation settings return 0 and 1 cuts on so short a series.
- **Lakes Michigan-Huron:** the late-1990s drop is found at 1999 by 4 of 6; both
  autocorrelation settings return no cuts, so 4 is the ceiling.

Where those settings find nothing, no true change can reach "all six". Eight
real series in all, break dates recalled rather than read from papers, so this is
agreement, not a detection rate. Numbers and script: the changepoint-detector
README, `eval/consensus-real.mjs`.
