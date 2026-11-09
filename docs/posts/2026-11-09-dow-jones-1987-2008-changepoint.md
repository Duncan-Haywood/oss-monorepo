---
title: "Two crashes in 33 years of Dow Jones returns: what a changepoint detector finds"
seo_title: "Changepoint detection on Dow Jones returns: 1987 and 2008"
date: 2026-11-09
tags: [changepoint-detector, time-series, finance]
description: "Run on 8,609 daily DJIA returns, the meanvar model dates the 2008 Lehman day exactly and brackets Black Monday 1987. The plain model cuts 27 times, the corrected ones 10 or 11."
---

changepoint-detector had European index returns but no crash. We added the
Dow Jones, 8,609 daily log returns from 1980 to 2012 (`AER::DJIA8012`).

The plain mean-and-variance model cuts 27 times. It puts a cut on
2008-09-15, the day Lehman failed, and cuts either side of Black Monday
(14 and 28 October 1987), as it would any short high-variance window. With
`--dispersion` the count falls to 10 and the 1987 cut moves to 6 October; with
`--bootstrap` it is 11. Both keep a cut in September 2008.

So the crashes survive the fixes that remove over-cutting, and the plain
model's extra cuts are mostly spike-bracketing pairs. Caveats: both event
dates are recalled, not read from a source, and `--robust` did not finish in
nine minutes on a series this long. The result is pinned in
`djia-returns.test.mjs`; the README section says what was not done.
