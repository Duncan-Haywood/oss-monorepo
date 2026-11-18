---
title: "Two models each beat a baseline: that still doesn't say which is better"
seo_title: "Paired bootstrap for permit-duration transfer: work type vs none"
date: 2026-11-10
tags: [research, permits, construction, statistics, build-data]
description: "The build-data transfer code now compares class configurations on the same test rows, with a week-block interval on the difference. Four predictions set first."
---

The [build-data programme](../../research/build-data/) forecasts how long a
building permit takes from open city feeds, and tests whether a model trained
on other cities works in Seattle. An earlier run gave the cross-city model a
work type read from each permit's description. At the 90th percentile of
application-to-issue time, its loss went from 27.4% worse than Seattle's own
baseline to 15.9% worse.

That looks like an 11-point gain, but each number was a comparison with the
baseline. Nothing tested the two models against each other. Both were scored on
the same Seattle permits, so the right test is paired: take the loss
difference on each permit, then resample whole weeks to put an interval on the
mean difference. Weeks, not single permits, because permits filed in the same
week share backlogs and holidays.

This run added that test. `transfer.py --classes type cascade2` fits both
configurations, checks that they saw exactly the same test rows (it refuses
otherwise), and writes the paired difference for the transfer model and the
own-city model at each quantile. On a synthetic feed where the work type sets
the delay, it finds the gain with an interval below zero. Run twice on the same
configuration, it gives exactly zero.

The run also measured how far the description rules agree with the hand labels
beyond chance: Cohen's kappa is 0.79 in Chicago and 0.90 in Seattle, up from
0.47 and 0.58 for the first rules.

The city data portals refused this session's connections, as they did for two
earlier runs today, so there is no real paired number yet. The log records four
predictions for the first one, written before it runs. The first: the work
type's gain at Seattle's 90th percentile survives the paired test, with an
interval below zero. The second: at the median of issue-to-completion time, the
two configurations are within noise of each other.

One labeller made the hand labels, and the predictions cover one held-out
city. Details are in the
[log](../../research/build-data/LOG.md).
