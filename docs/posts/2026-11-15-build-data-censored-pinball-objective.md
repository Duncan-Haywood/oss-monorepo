---
title: "A censored pinball loss lets a boosted model learn from builds that haven't finished yet"
seo_title: "Censored quantile loss for LightGBM: custom objective, leaf renewal"
date: 2026-11-15
description: "Charging unfinished permits only while the forecast is below their elapsed time cuts the deployable tail cost from +2.53 to +1.63 days."
tags: [research, build-data, construction, censoring, quantile-regression, lightgbm, survival-analysis]
---

# A censored pinball loss lets a boosted model learn from builds that haven't finished yet

The build-data programme forecasts how long a building takes from permit issue to completion. The model is trained on other cities' open permit feeds and used in a city it has never seen. On the day you would deploy it, 1 January, the source permits still under construction are exactly the long builds, and dropping them costs the 0.9-quantile forecast up to 5 days of pinball loss in San Francisco and Seattle.

Two earlier fixes fell short. [Reweighting the finished permits](2026-11-14-build-data-weights-cannot-see-past-the-window.md) (IPCW) helped but couldn't reach the permits that had been open longer than any finished one. [Portnoy-style pseudo-rows](2026-11-15-build-data-censored-pseudo-rows-break-boosted-trees.md) made things far worse, because LightGBM resets each quantile leaf to a percentile of its residuals and landed on the pseudo-rows' "+infinity" labels.

This session wrote the loss that post called for, as a LightGBM custom objective ([`src/cpin.py`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/src/cpin.py)).

## The loss

A permit still open on the decision date, issued c days earlier, only tells you its build takes at least c days. So it is charged `tau * max(c - q, 0)`: a penalty while the forecast q is below its window, nothing above. Finished permits keep the usual pinball loss.

Every tree is grown on that loss's gradient. Then each leaf is set to the value that minimises the same loss over the rows in it, as LightGBM does for its own quantile objective. That minimiser works out to a weighted percentile of the leaf's residuals: weight 1 for a finished permit, weight tau for an open one sitting at its window. An open permit can lift a leaf only as far as its own window, so there is no stand-in label to snap onto.

On finished permits alone the loop reproduces LightGBM's built-in objective: 73.27 days of q0.9 loss on San Francisco 2021 against 73.17.

## The result

Change in 0.9-quantile pinball loss on the test year, in days, against a model trained in hindsight with complete labels (cascade2 work-type class, 3 seeds, fresh pull of the feeds; lower is better). All three columns are deployable models that use only what is known on 1 January:

| city, test year | drop open permits | IPCW weights | censored pinball |
|---|---|---|---|
| San Francisco 2021 | +3.28 | +1.77 | **+0.86** |
| San Francisco 2022 | +1.63 | +0.99 | **+0.23** |
| Seattle 2021 | +10.28 | +4.16 | **+2.94** |
| Seattle 2022 | +3.78 | +3.20 | **+2.48** |
| mean | +4.74 | +2.53 | **+1.63** |

That closes about two-thirds of the gap to the hindsight model. The median forecast gets slightly better too: −0.15 days on average, against IPCW's +0.34. With the hindsight model's early stopping, the same loss recovers 47 to 89% of what dropping the open permits costs. It comes within a day of the hindsight model in 3 of 4 city-years, a test IPCW and the pseudo-rows both failed.

We wrote seven predictions down before the run, and six held. The one that failed: no q0.9 forecast would pass ten years. Three of 24 runs produced one, at most 4,569 days, on one to three test permits each. The capped pseudo-rows did this in 33 of 36 runs, on up to 4% of permits. The hindsight model, refitted afterwards to check, does the same in 3 of its 12 San Francisco runs, up to 4,337 days. So that bar was set below what complete labels give.

## Caveats

- One work-type class and 3 seeds. No confidence intervals, because per-row losses weren't kept. Each gap to IPCW is under a day and a quarter, so the evidence is that all four city-years go the same way.
- Longer tails aren't better everywhere. Austin's builds are shorter than its source cities', so there the models that lose the long builds win. Giving the open permits back shrinks Austin's q0.9 gain against the hindsight model from 7.5 and 10.2 days (IPCW) to 2.6 and 7.7. This was reported, not tested.
- The 0.1 quantile wasn't fitted, to save time. Open permits sit far above it.
- The frame still leaves out permits that never complete in the feed. A real deployment would see those as open too.
- The loss isn't a proper scoring rule for censored rows: it never learns how far past its window an open build ran. What is left of the gap probably lives there, and in a censored early-stopping year.

## If you fit quantiles on censored data with gradient boosting

Charge a censored row only while the prediction is below its censoring point, and renew leaves from that censored loss, not from the plain pinball loss. In LightGBM that takes a custom objective plus `Booster.set_leaf_output` after each round. Keep your own running predictions, because LightGBM's cached scores go stale once you overwrite the leaves. The loop costs about half a second a round on 2 million rows.

The numbers are in [`results/rounds_score_cpin_i2c_summary.json`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/results/rounds_score_cpin_i2c_summary.json). The full log, with every prediction written before the run, is session 90 of [`LOG.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/build-data/LOG.md).
