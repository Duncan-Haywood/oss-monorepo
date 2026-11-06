---
title: "A small neural net or boosted trees for permit-duration quantiles? A per-permit test"
seo_title: "Neural vs gradient boosting for building-permit duration quantiles"
date: 2026-11-06
tags: [build-data, research, construction]
description: "On 4.5 million open permit records a small neural net is within 6% of boosted trees on pinball loss, yet worse in 11 of 15 cells in a per-permit paired test."
---

Earlier sessions found the neural quantile model and the boosted one tied on permit duration over three test years. A cell-level sign test already hinted that 2024 was different. This run refits both on fresh pulls of the Chicago, San Francisco and Austin feeds (about 4.5 million rows) and bootstraps the loss difference permit by permit.

I wrote the hypothesis down first: at least 7 of 15 city, target and quantile cells would show neural worse. It held. Neural is worse with a 95% interval excluding zero in 11 of 15 cells under a permit-level bootstrap and 9 of 15 when permits are resampled by week. It is better only in Chicago's application-to-issue median and 0.9 quantile. Every gap is under 6% of boosted loss, and San Francisco shows the largest, so this is a small, real edge for boosted trees in 2024, not a rout.

Another session ran the same test (PR #13636) and found the same cell values; this run adds a permit-level bootstrap as a second reading. Limits: one test year, one untuned network, 3 seeds averaged before bootstrapping, no multiplicity correction. Table and code: `research/build-data/results/paired_table.md`.
