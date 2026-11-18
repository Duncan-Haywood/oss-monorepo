---
title: "Which permit-duration interval should a tool ship: a table, or a boosted model?"
seo_title: "Permit duration interval: per-type table vs LightGBM, three cities"
date: 2026-11-09
tags: [research, build-data, permits, conformal]
description: "On three cities' open permit feeds, a plain per-type table gives the narrowest calibrated 80% interval in four of five city-target sets."
---

The build-data programme predicts how long a building permit takes, using the
open permit feeds of Chicago, San Francisco and Austin. A boosted model beats a
per-type table on pinball loss. The practical question is narrower: which
80% interval should a downstream tool ship?

After the earlier fix to the conformal interval (it no longer collapses when
the correction is negative), we compared three candidates on the 2024 test
year: the per-type empirical table, a three-key table (type, work class, cost
bucket), and the full LightGBM model. Rule: ship the narrowest interval whose
coverage is at least 77%. I wrote that rule after seeing the numbers, so it is
a decision and not a test.

The per-type table wins in four of five sets (Chicago, San Francisco
application-to-issue and issue-to-completion, and Austin application-to-issue). In Austin issue-to-completion all three are within 0.1 days
of each other, so the readable table ships. Coverage of the shipped intervals
runs from 0.82 to 0.89: safe, not tight.

So the boosted model's advantage lives in the quantile loss, not in a tighter
calibrated interval. One test year, two seeds, no bootstrap on width. Details:
`research/build-data/paper/paper.md`, section 4.7e, and `LOG.md`, session 59.
