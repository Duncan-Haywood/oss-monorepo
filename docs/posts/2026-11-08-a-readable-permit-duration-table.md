---
title: "A readable permit-duration table keeps most of the boosted gain in two of three cities"
date: 2026-11-08
tags: [research, construction, permits, open-data]
description: "An empirical table on permit type, work class and cost bucket keeps 67 to 87% of a boosted model gain in Chicago and Austin, but not in San Francisco i2c."
---

Earlier this week a table of permit type by cost bucket kept almost none of a boosted permit-duration model's gain over a per-type baseline. A feature ladder then pointed at work class as the missing key. This run built that table: empirical quantiles on permit type x work class x cost bucket, backing off to coarser cells when a cell has under 30 rows, scored on test year 2024.

It keeps 0.80 (Chicago application-to-issue, median only), 0.67 and 0.87 (Austin, two targets) and 0.59 (San Francisco application-to-issue) of the full model's mean pinball gain, and 0.35 in San Francisco issue-to-completion. San Francisco's feed has no work class, so its table is just type x cost.

Limits: the hypothesis was applied after the run, not logged before it, so the verdict is post hoc. Austin's table has about 195 cells, a lookup rather than a short chart. One test year, two seeds, interval coverage unchecked. Details: `research/build-data/LOG.md`, session 53.
