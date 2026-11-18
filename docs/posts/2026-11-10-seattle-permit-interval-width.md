---
title: "Seattle permit-duration intervals: a simple lookup table beats the per-type baseline on width"
seo_title: "Seattle building permit duration forecast interval width, open data"
date: 2026-11-10
tags: [build-data, permits, conformal-prediction]
description: "A week-block bootstrap on Seattle's open permit feed shows a three-key lookup table gives narrower 80% intervals than the per-type baseline."
---

The `research/build-data` programme asks whether open permit records predict
how long a permit takes to issue and a build to finish. In Chicago, San
Francisco and Austin the plain per-permit-type quantile baseline gave the
narrowest calibrated 80% interval in four of five city/target sets. Seattle
(public-domain feed, 194,184 rows, test year 2024) differs.

With the same dequantised conformal interval, the three-key table (permit
type, work class, cost bucket) is narrower than the baseline in both targets:
application to issue by 7.4 days [95% CI -13.3, -1.1] on a width near 250,
and issue to completion by 18.3 days [-23.4, -12.9] on a width near 650. The
gain is 3% of width at best, from one test year, so it is a result for
Seattle, not a rule. Coverage stays at 0.83 and 0.82 for the table against a
nominal 0.80.

Numbers and caveats: `research/build-data/LOG.md`, session 63.
