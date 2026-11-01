---
title: "The bootstrap penalty did not lose that step: the season was missing"
date: 2026-11-01
tags: [changepoint-detector, statistics, negative-result]
description: A caveat in the changepoint detector's real-data sweep turned out to be a missing seasonal term, not a power loss.
---

The changepoint detector's real-series sweep said `--bootstrap` loses the 1973-12 fall in US accidental deaths. Re-running it with the 12-month season removed first, `meanvar --bootstrap` keeps 1973-12 and drops the two later steps (1975-07, 1978-03) that plain `meanvar` adds. Without the season, plain `meanvar` already finds only 1973-11, and `--bootstrap` finds nothing, because winter peaks are not steps.

So the caveat was the sweep running with no `--period`, not the penalty. This is one 72-month series with one dated coincidence (the 1973 oil embargo), so it is a check, not a benchmark. The eval, test and output are in `ventures/changepoint-detector/` (`eval/us-accidental-deaths-bootstrap.mjs`).
