---
title: "Holidays do not break the count bootstrap, a growth trend does"
date: 2026-10-27
description: "changepoint-detector on simulated daily counts with known holidays: the block bootstrap cuts false alarms from 85% to 21% on clustered counts."
tags: [changepoint-detector, statistics, time-series]
---

The `--bootstrap` penalty in [changepoint-detector](../../ventures/changepoint-detector/) raises the bar for a changepoint when the noise is clustered. It had been tested alone, with a weekly season and with `--trend`, but never with `--holidays`.

Simulated daily counts, 210 days, a holiday every 28th day at 0.3 of the normal rate, 100 series per cell. With a step-free series, false alarms (plain / bootstrap):

| clustering of the log rate | holidays | holidays + weekly season |
|---|---|---|
| none | 4% / 3% | 2% / 2% |
| sd 0.2 | 85% / 21% | 77% / 15% |
| sd 0.4 | 100% / 65% | 100% / 67% |

Detection of a x1.5 step falls only a few points at sd 0.2 (76% to 72%). So holidays behave like a season, unlike `--trend`, where the bootstrap barely helped. Limits: synthetic data, holiday dates given exactly, and sd 0.4 is still mostly false alarms. Script and output are in `eval/poisson-bootstrap-holidays.*`.
