---
title: "Letting stickiness change finds a change, just not the orange-juice freezes"
seo_title: "A per-segment stale rate for sticky series: a negative result"
date: 2026-11-12
tags: [changepoint-detector, time-series, negative-result, pre-registration]
description: A stale probability per segment dates a change in stickiness 103 times in 120, but finds the same 5 of 8 orange-juice freezes and lowers benchmark cover.
---

Florida frozen orange-juice prices repeat the previous month exactly 41% of the time. Every way of handling that we have tried in the [changepoint detector](https://marisstella.app/changepoint-detector/)'s drift model cuts far fewer changes than the shipped model, and every one also loses the same three documented freezes: 1958, 1970 and 1985.

There was one idea left. If each repeat is a coin flip with one stale probability for the whole series, the algebra says it picks exactly the same changes as treating repeats as missing data, so it can't help. But give **each segment its own** stale probability and a change in how often the series updates counts toward a cut. Our guess was that a freeze moves the price and also makes it update more often, so this would win the lost freezes back.

We wrote the rule first and committed it before the option had run on anything: at least 7 of 8 freezes with at most half the shipped cuts; no loss of F1 or cover (beyond 0.02) on the four sticky series in the Turing Change Point Dataset; false cuts on a sticky random walk at most about twice those of the missing-data model; and no loss of power on a 5-unit step.

It failed three of the four:

- **Juice: the same 5 of 8 freezes**, with 24 cuts against 18 for the missing-data model.
- **Benchmark cover fell** from 0.570 to 0.435. Children per woman alone went from 0.780 to 0.408, because the model now cuts where the update rate shifts and annotators saw nothing.
- On a sticky walk with no change it averaged 3.98 false cuts against 1.59.

It did do what it was built to do: on a simulated series that goes from 10% repeats to 60%, with no change in level, it dated the switch in 103 of 120 series. That is a real signal. It just isn't the one a reader looking for level changes wants.

Afterwards we checked the guess directly. The repeat share does fall after five of the eight freezes. But at the three lost ones it barely moves: 0.67 before and after 1958, 0.58 to 0.42 around 1970, 0 and 0 around 1985. Those are small jumps in a series that updates at the same rate either side, and no model of the repeats can tell them from ordinary wander.

So four treatments (drop the repeats, call them missing, double the penalty, and now a stale rate per segment) fail the same real-data test, and the sticky-series warning keeps telling readers to check jumps at the ends of flat runs against the raw data. A line in the report saying "this series began updating less often here" may be worth building. That is a description, not a change detector, and it's a separate question. The rule, output and tests are in [`ventures/changepoint-detector`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/changepoint-detector) (`eval/drift-stale-segment.mjs`, `drift-stale-segment.test.mjs`).
