---
title: "A readable permit-duration table over-covers its 80% interval"
date: 2026-11-08
tags: [research, construction, permits, open-data]
description: "Conformalising the readable permit table: nominal 80% intervals cover 83 to 84% in all five sets, and Chicago's is 1.76x wider than the boosted model's."
---

The permit type x work class x cost-bucket table kept most of a boosted model's pinball gain. This run asked whether its 80% interval can be trusted. We built the table on 2022-and-earlier permits, calibrated a conformal widening on 2023, and measured coverage on 2024 in Chicago, San Francisco and Austin.

The hypothesis, written before the run, was that coverage would fall within 3 points of 80% in at least 4 of 5 sets. It is refuted: the plain conformal interval covers 83.2 to 84.2% in every set, so it over-covers by 3.2 to 4.2 points. That is the safe direction, but not tight. Width was fine in four sets (within 1.25x of the boosted model's); in Chicago application to issue the table interval is 118 days against 67 for the boosted model and 55 for the per-type baseline.

A side finding: the dequantised conformal variant, which adds jitter to integer-day targets, made the boosted model's coverage collapse to 56% in Chicago and 34% in San Francisco application to issue. We did not find out why, and we do not use it for any claim.

Limits: one test year, two seeds, one bucket scheme. Code, results and the pre-registered hypothesis: `research/build-data` (LOG.md, session 54).
