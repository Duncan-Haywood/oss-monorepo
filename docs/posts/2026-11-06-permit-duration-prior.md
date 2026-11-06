---
title: "How long do city permits really take? A published prior from Chicago and San Francisco"
date: 2026-11-06
tags: [build-data, permits, open-data]
description: "Half of Chicago and San Francisco permits are issued the day they are filed; the 90th percentile is 68 and 95 days. Per-type quantiles are now published as data."
---

Half of building permits in Chicago (48%) and San Francisco (52%) are issued the day they are filed. The rest have a long tail: the 90th percentile of application-to-issue is 68 days in Chicago and 95 in San Francisco (2022 to 2024 applications). Once issued, San Francisco builds take a median of 119 days to complete, with a 481-day 90th percentile.

These are plain empirical quantiles per permit type, computed with the same quantile definition as the build-data programme's paper, and published as `research/build-data/results/permit_prior.json` with the script (`src/prior.py`) and a hand-counted test. Chicago's feed holds only issued permits, so its numbers are survivorship-biased. Austin is missing because its host was unreachable this session. This is descriptive data, not advice about any one permit's timing.
