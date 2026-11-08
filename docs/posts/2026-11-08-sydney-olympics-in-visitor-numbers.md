---
title: "Can a changepoint detector find the Sydney Olympics in visitor numbers?"
seo_title: "Can a changepoint detector find the Sydney Olympics?"
date: 2026-11-08
tags: [changepoint-detector, time-series, tourism]
description: "Quarterly US arrivals to Australia, run through four detector models: two date the Olympics quarter exactly, two lose it."
---

Quarterly short-term arrivals to Australia from the US, 1981 to 2012 (127 values), had been sitting in the changepoint detector's data folder untested. We ran it through four models.

The Sydney Olympics were in September 2000, so 2000Q3. The default mean model cuts there (and at 1988Q3 and 2001Q3, among twelve cuts in all). The trend model, with five cuts, also lands on 2000Q3. The variance-aware model (`meanvar`) and the autocorrelation-corrected one (`ar1 auto`) both drop it: the first dates 2002Q2 instead, the second has no cut in 2000.

The same pattern appeared with SARS in the Japan series: the models that stop the detector over-cutting also absorb a one-quarter spike. That is a trade-off to know about, not a bug to hide. The event dates are recalled, not read from a source, nothing here is tested for significance, and it is one series. The new test file pins the cut lists so a later change to the engine shows up.
