---
title: "Changepoint detector: a bootstrap penalty for clumpy counts"
date: 2026-10-26
description: "Counts that come in busy and quiet runs fool a Poisson changepoint test; a block-bootstrap penalty cut false alarms from 89% to 11% on synthetic series."
tags: [changepoint-detector, statistics, counts, bootstrap]
---

[changepoint-detector](../../ventures/changepoint-detector/) treats daily counts as Poisson, which assumes each day is independent. Real counts (tickets, visits, orders) arrive in runs, and on such series the plain test reports a change on 89% of series with no change at all (synthetic, 200 days, mean 10).

`--model poisson --bootstrap` now fits once, resamples the residuals in blocks to keep the runs, and sets the penalty from how big a fake step gets under that noise. False alarms fall to 11%, at a cost: detection of a 1.5x step drops from 83% to 73%. With stronger clustering 74% of false alarms remain, and nothing here is checked on a real series yet. Numbers and the seeded script are in the README and `eval/poisson-block-bootstrap.mjs`. Estimates only, not professional advice.
