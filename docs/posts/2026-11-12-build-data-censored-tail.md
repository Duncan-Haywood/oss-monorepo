---
title: "The demolition finding was a censoring artefact: a fold rule fixed in advance helps Chicago, hurts Austin"
seo_title: "Right-censored permit build times and cross-city transfer"
date: 2026-11-12
description: "Seattle's short 2024 demolition build tail is right-censoring at the pull. A class-merge rule fixed in advance helps a borrowed model in Chicago, hurts Austin."
tags: [research, build-data, construction]
---

# The demolition finding was a censoring artefact

[This morning's post](2026-11-12-build-data-fold-demolition.md) reported that merging demolition into alteration cuts a borrowed permit model's Seattle build-time error at the 0.9 quantile by two thirds. Its advice was to check each class's upper tail in the source cities against the target city and merge any class where the sources run longer. The merge itself had been chosen after looking at the test year. This session fixed the rule in advance and tested it, and the advice does not survive.

**The rule.** For each work class, compare the 0.9 quantile of the target (days) in the source cities' training years with the held-out city's own history. Both cover years up to two before the test year, and the test year is never read. Merge any class whose source/history ratio has a 95% bootstrap interval above 1. Five predictions were logged before the runs.

**Seattle, build time.** The rule merges nothing. Against Seattle's own history the source cities have the shorter demolition tail (665 days against 952), the reverse of what the 2024 test year showed (552). The reason is right-censoring: a 2024 permit appears in the build-time test set only if it was completed before the data pull. Censoring Seattle's history to the same window brings demolition's 0.9 quantile to 580 days, within 5% of the test year, and every large class lands within 8%. So the earlier "cost of naming demolition" comes from scoring on censored labels. The source cities do not mislead the model about how long Seattle demolitions really take.

**Issue time, where censoring matters little:**

| held-out city, 2024 issue time | classes merged | change in q0.9 loss of the borrowed model (95% interval) |
|---|---|---|
| Chicago | 6 of 9 | **-1.46 days (-1.58 to -1.34), -13% of the baseline's loss** |
| Austin | 4 of 9 | **+2.96 days (+1.67 to +4.27), +8%** |

The same rule helps in one city and hurts in the other. In Austin most of the damage sits in mechanical and plumbing permits, classes the rule did not touch. Their source-city tails are far shorter than Austin's, and merging other classes reshapes the shared model for them too. A per-class tail ratio does not predict what a merge does.

**What follows.** Every build-time score in this programme so far uses test years whose long builds have not finished yet. The next step is a censoring-aware evaluation: score only issue cohorts old enough to have completed, or use a censored pinball loss. The class comparisons then need rerunning under it. A merge rule should be checked by refitting on the validation year, not read off tail ratios.

Limits: one rule and threshold, 3 seeds, two held-out cities for issue time and one for build time. Code, data and every number: [`research/build-data`](../../research/build-data/README.md) ([`LOG.md`](../../research/build-data/LOG.md), session 77).
