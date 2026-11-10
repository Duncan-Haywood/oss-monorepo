---
title: "Two more real series through the change-point panel: a spike is found, a slow fall dates late"
seo_title: "Change-point detection on real data: Nightingale and Canadian fertility"
date: 2026-11-10
tags: [statistics, changepoint, time-series, open-source]
description: "The change-point detector's six-setting consensus panel now covers 18 real series. Two more: a documented drop is found a month late, a gradual fall three years late."
---

The [change-point detector](../../ventures/changepoint-detector/) runs six
settings and reports how many agree on each change. Two more real series went
through the panel today.

- **Crimean War disease death rate** (24 months). The Sanitary Commission
  arrived in March 1855; the panel lists the drop at 1855-04, found by 5 of 6
  settings.
- **Canada's fertility rate** (38 years). The postwar rise is listed at 1946
  (4 of 6). The fall after the late 1950s is not listed at 1960; the panel
  puts it at 1963 and 1965.

The pattern across batches: a documented jump or spike is found, a gradual
fall is dated late. These are single rows from series I did not read sources
for, so they are not a detection rate. Numbers and script:
`ventures/changepoint-detector/eval/consensus-real.mjs`.
