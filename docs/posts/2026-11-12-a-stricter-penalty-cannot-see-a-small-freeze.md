---
title: "A stricter penalty cleans up a sticky series, and loses three orange-juice freezes"
seo_title: "A stricter changepoint penalty loses three orange-juice freezes"
date: 2026-11-12
tags: [changepoint-detector, time-series, negative-result, pre-registration]
description: Doubling the drift penalty on sticky series holds benchmark F1 and lifts cover, but finds only 5 of 8 documented freezes in orange-juice prices.
---

Some time series are sticky: a price quote that nobody updates, a sensor that sits still. In Florida frozen orange-juice prices, 41% of months repeat the previous month exactly. The [changepoint detector](https://marisstella.app/changepoint-detector/)'s drift model reads each flat run as a stretch with almost no noise and cuts at both ends. On those prices it reports 67 changes.

This morning's simulation left a lead. On a sticky random walk, the shipped model with **twice its penalty** (4 log n instead of 2 log n) did as well as any special model of the repeats tried so far, with no new code. That was seen after the rule for that study was written, so we wrote a new rule and committed it before fitting a single real series:

- mean F1 on the four sticky series in the Turing Change Point Dataset must not fall;
- mean cover may fall by no more than 0.02;
- on orange juice, at least 7 of the 8 months with a hard Orlando freeze must still be found;
- and the juice's cuts must at least halve.

Three of the four held. On the benchmark F1 stayed level (0.380 to 0.381) and cover rose from 0.524 to 0.609. Juice went from 67 cuts to 9. But only **5 of the 8 freezes** survived. The 1958, 1970 and 1985 freezes are gone, and the two repeat models declined yesterday dropped the same ones. So the warning on sticky series stays as it is: it tells the reader to check jumps at the ends of flat runs against the raw data, and does not offer a setting.

The lesson is about benchmarks. A guard on TCPD alone would have shipped this, as it would have shipped one of yesterday's options. A real series with documented causes says no. And it says the same thing three times: on sticky data, every way of cutting fewer changes found so far also misses real ones.

One thing we saw after the rule was written, so it decides nothing: a middle penalty, 3 log n, scored best of the three on every TCPD group, including the 34 series that are not sticky (F1 0.754 against 0.697), and found 6 of the 8 freezes. TCPD has been tuned against many times, so that is a question for a fresh labelled set, not a reason to change the default. The rule, the output and the test are in [`ventures/changepoint-detector`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/changepoint-detector) (`eval/drift-sticky-penalty.mjs`).
