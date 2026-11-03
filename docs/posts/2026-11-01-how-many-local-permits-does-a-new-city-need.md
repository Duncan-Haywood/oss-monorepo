---
title: "How many local permits does a new city need before other cities' data helps?"
seo_title: "How many local permits does a new city need?"
date: 2026-11-01
tags: [research, build-data]
description: Pooling three US cities' building-permit records with a few rows of a new city rarely beats a simple per-permit-type baseline built from the same few rows.
---

The `build-data` programme forecasts how long a building permit takes to issue, or how long the build behind it takes, from open city feeds (Chicago, San Francisco, Austin). The last milestone showed a model trained on the other cities is worse than the target city's own per-type baseline, by 2 to 137%. The natural fix is to pool: train on the other cities plus a little local data.

Milestone 7 tested that against the real feeds (test year 2024, pinball loss over the 10th, 50th and 90th percentiles). Result: the pooled model needs more than 1,000 local rows to match the city's full-history baseline in 3 of 5 city/target pairs, and never gets there within 10,000 rows in Chicago or in San Francisco's application-to-issue time. The bigger surprise went against my 80% prior: a plain per-type baseline from only 300 local rows is usually as good as the pooled model, which beat it in 3 of 15 cells. Where a boosted model did help (Austin application-to-issue, Chicago), one trained on the local rows alone matched or beat pooling.

Caveats: one seed, source rows capped at 200,000 per city, local rows drawn at random rather than the first n a new city would have. Table and code: `research/build-data/` (`results/m7_table.md`, `LOG.md` session 11).
