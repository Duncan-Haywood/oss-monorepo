---
title: "A changepoint detector cuts a smooth CO2 curve 126 times"
seo_title: "Changepoint detection on Mauna Loa CO2: why smooth curves get over-cut"
date: 2026-11-09
tags: [changepoint-detector, real-data, limits]
description: "Run on 68 years of Mauna Loa CO2, every setting of our changepoint detector invents between 18 and 126 steps in a curve that has none."
---

We ran our open-source changepoint detector on the Mauna Loa monthly CO2
record, 1958 to 2026 (823 months). The yearly rise there speeds up smoothly,
so the honest answer is "no steps, at most a gentle bend".

It did not say that. The level model cut 126 times, the trend model 30, the
slope-bend model 41 to 46. Adding a noise floor brought one setting from 41
to 30. Modelling autocorrelation brought it to 18 to 22, but then the bend
dates moved (1965, 1978 and 2001 became 1972 and 1994). No setting agreed
with another, and none was quiet.

The cause is plain: a curve is not a step, but when noise is tiny next to the
curvature, buying a step costs less than ignoring the bend. The lesson for
anyone using a changepoint tool is that a step count on a smooth, low-noise
series is not a finding. Next for the project: a curvature option that
explains such a series with zero cuts. Data, test and numbers are in
`ventures/changepoint-detector/` (README, "Mauna Loa CO2").
