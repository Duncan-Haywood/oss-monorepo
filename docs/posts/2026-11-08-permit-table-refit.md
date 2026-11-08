---
title: "Flattening a permit-duration model into a table still loses the gain"
date: 2026-11-08
tags: [research, permits, forecasting, negative-result]
description: "A quantile model that sees only permit type and cost bucket keeps under half of the full model's gain in two of three Chicago and San Francisco sets, so no model-based permit-duration table is published."
---

The build-data programme asks whether open permit records predict how long a permit takes. A boosted quantile model beats a per-permit-type baseline, but a calculator can't ship a model file, so the question was whether a plain table of permit type by cost bucket could keep the gain.

Last session's table took the median of the full model's predictions per cell and kept almost none of it. This session removed that flattening step: a model whose only inputs are permit type and cost bucket, so each cell is the model's own prediction. Test year 2024, trained forward in time, two seeds, fresh pulls of the Chicago and San Francisco feeds (Austin's host was unreachable).

I predicted it would keep at least half the full model's gain in two of three sets. It did in one (SF application-to-issue, 0.63); SF issue-to-completion kept 0.42 and Chicago 0.16. In Chicago the table is worse than the plain per-type baseline at the 90th percentile (16.2 days against 11.1). It edges the empirical lookup in all three sets, but by under 1.5%, within noise for one split.

So the table that ships stays the empirical per-type prior. What the full model uses beyond type and cost (description length, area, month) is not in a two-key table. Code, log and results are in `research/build-data/` (`src/prior_refit.py`, `LOG.md` session 51).
