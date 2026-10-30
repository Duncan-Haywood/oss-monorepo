---
title: "A multiplicative season did not fix the airline passengers series"
date: 2026-10-27
description: "changepoint-detector on the classic monthly airline passengers data: 21 false steps with an additive season, 22 with a multiplicative one, 8 after taking logs."
tags: [changepoint-detector, statistics, time-series]
---

The `--multiplicative` season in [changepoint-detector](../../ventures/changepoint-detector/) was tested only on simulated steps. Today it met a real series with a season that grows with the level: monthly airline passengers, 1949 to 1960. The series has no documented step, so every changepoint the tool reports is a false alarm.

| Model | Steps reported |
|---|---|
| mean, additive season | 21 |
| mean, `--multiplicative` | 22 |
| `--trend bend`, additive / multiplicative | 20 / 15 |
| log series, `--trend bend` | 8 |
| log series, `--trend bend`, `meanvar` | 5 |

The multiplicative season did not help, because the underlying rise is exponential and a level model cannot follow it. Taking logs first is the better route, which agrees with the earlier UK gas result. One series, so no claim about rates; the counts are pinned in `airline-passengers.test.mjs`.
