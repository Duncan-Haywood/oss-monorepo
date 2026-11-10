---
title: "A third-difference noise floor does not stop over-cutting on real drift"
seo_title: "Changepoint detection noise floor: third differences tested on real series"
date: 2026-11-10
tags: [statistics, changepoint, negative-result, open-source]
description: "We tested a third-difference noise floor in the open-source changepoint detector on six real drifting series. It over-cuts as much as second differences did."
---

Smooth, drifting series make changepoint detectors cut too often. The
[changepoint detector](../../ventures/changepoint-detector/) has a noise floor
that stops this, but the first-difference version is polluted by the drift
itself. The second-difference version fixed that on a straight drift and then
failed on real, curved series.

The obvious next step was third differences, which cancel a quadratic drift.
We added `--noise-floor-diff3` and ran it on the same six real series.

It did not help. Australian residents get 7 cuts at k=3, the same as second
differences and against 1 for the first-difference floor at k=2. US real GDP
gets 12 to 16, and Mauna Loa 10 to 13. Curvature was not the cause. Real
quarterly series carry autocorrelated wobble that differencing amplifies, so
the high-order floor sits near the raw noise level.

For real drift, use the first-difference floor at k=2. The option stays in,
off by default, and the README records the numbers. Next up is a floor from a
robust local fit instead of differences. Six series, no detection-rate claim.
