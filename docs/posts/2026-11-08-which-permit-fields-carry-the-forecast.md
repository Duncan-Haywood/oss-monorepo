---
title: "Three permit fields carry most of a permit-duration forecast"
date: 2026-11-08
tags: [research, construction, permits, open-data]
description: "Refitting a permit-duration model on nested field subsets: permit type, cost and work class keep 59 to 87% of the full model gain over a per-type baseline."
---

Yesterday's attempt to flatten a boosted permit-duration model into a readable table of permit type by cost bucket kept almost none of its gain. This run asked what the table was missing. We refit the same LightGBM quantile models on growing sets of fields (Chicago application to issue, San Francisco and Austin both application to issue and issue to completion, test year 2024) and measured the share of the full model's pinball gain over the per-type baseline that each set keeps.

Permit type alone keeps between -0.28 and 0.16 of it. Adding cost gives 0.11 to 0.87. Adding work class lifts every set to 0.59 to 0.87, and description length takes the range to 0.89 to 0.99. Month and weekday add nothing visible. Yesterday's table had type and cost but no work class.

Limits: these are refitted models on continuous cost, not tables, so whether a type x work class x cost-bucket table keeps the share is the next test. One test year, two seeds, one greedy feature order. Data, code and the pre-registered hypothesis are in `research/build-data` (LOG.md, session 51).
