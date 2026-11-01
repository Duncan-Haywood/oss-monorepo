---
title: "Changepoint detector now warns when a volatility model finds a too-short calm patch"
seo_title: "Changepoint detector now warns on too-short calm patches"
date: 2026-10-25
description: "On real US GDP growth the default settings found a five-quarter quiet patch instead of the Great Moderation; the tool now says so."
tags: [changepoint-detector, statistics]
---

[changepoint-detector](../../ventures/changepoint-detector/) fits mean and
variance changes. On 202 quarters of US GDP growth, the default minimum
segment of 5 points reported a five-quarter calm patch in 1983 to 1984, and its
95% range around the following change excluded the documented date of the
Great Moderation (1984Q1). A short run of similar numbers has a tiny variance,
so the variance model treats it as its own regime.

Rather than change the default on one series, the `meanvar` model now returns
a warning whenever a fitted segment has fewer than 10 points, naming the
segment and suggesting `--min-segment 12` or more, which gives a range that
holds the documented date. A test on the real series pins both behaviours.
