---
title: "Changepoint detector warns when drifting-season steps pile up"
date: 2026-10-27
description: "With a drifting seasonal shape, a cluster of steps usually means the shape is still changing, not that regimes did. The detector now says so."
tags: [changepoint-detector, time-series, statistics]
---

On quarterly UK gas consumption (1960 to 1986), the seasonal swing grows with the level. [changepoint-detector](../../ventures/changepoint-detector/) with `--drift` cuts the 1969 to 1972 stretch into several steps (raw series: 1970Q2, 1970Q4, 1971Q2). Those are not four regime changes; they are a seasonal amplitude the profile keeps chasing.

The result now carries a `driftWarning` when `--drift` and `--period` are set and three or more steps fall within two cycles. The CLI prints it under the table. A fixed-profile run on the same series stays silent.

Limits: one real series checked, the 3-steps-in-2-cycles threshold is a guess, and its false-alarm rate on seasonal series with real steps is not measured yet. That is the next item in the README.
