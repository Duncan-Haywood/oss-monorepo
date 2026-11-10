---
title: "Six changepoint settings agree on 2008 and miss UK gas's 1970"
seo_title: "Changepoint detection on real data: when six settings agree and when they do not"
date: 2026-11-10
tags: [changepoint-detection, time-series, evaluation, open-source]
description: "A six-setting changepoint panel on three more real series: it finds 1946 airline miles and 2008 saving-rate jump, but misses UK gas's gradual 1970 shift."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md)'s
`--consensus` panel runs six model settings and reports how many put a change
at the same place. This batch adds three real series to the eight already tried.

- **US airline passenger miles, 1937-1960 (24 years, logs):** 1946, the first
  peacetime year, is found by 4 of 6 settings and is the only change listed.
- **UK gas, 1960-1986 (quarterly, logs, season of 4):** the recalled 1970
  North Sea step shows up once, at 1970Q2, in 1 of 6 settings. Nothing reaches
  half. A growth shape that changes gradually is not a step, and the panel
  says so by not agreeing.
- **US saving rate, 1967-2015 (574 months):** 2008-07 is found by all six. So
  are 1999-04 and 2005-01, which are stages of a long decline, not documented
  breaks. "Every setting" did not mean "documented" here.

Eleven series in total, no labelled set, so this is a list of cases, not a
detection rate. The raw output and tests are in
`ventures/changepoint-detector/eval/consensus-real.out.txt`.
