---
title: "Australian beer production: the log scale dates the 1976 bend 15 years tighter"
seo_title: "Dating a slope change in Australian beer production"
date: 2026-11-07
tags: [changepoint-detector, real-data]
description: "On 218 quarters of Australian beer production, the log series puts a slope change at 1976Q2 within three years; the raw series spans fifteen."
---

Australian beer production grew until the mid-1970s, then flattened and fell. We ran the changepoint detector's slope-bend test on 218 quarters (1956Q1 to 2010Q2, fpp2's `ausbeer`).

- A level-only fit cuts it into 10 steps raw, 11 on the log: a slow rise and fall read as a staircase.
- With one slope bend on the log series: **1976Q2**, 95% range 1975Q2 to 1978Q1, slope falling afterwards.
- On the raw series the bend lands at 1977Q3, but the range runs 1974Q3 to 1989Q1.

On UK gas, earlier this month, the log lost the bend; here it tightens it. So the scale choice matters in both directions, and one series cannot say which is usual. Step dates left over (1983Q1, 1988Q2, 1992Q1) were not checked against events. Data, script and test are in `ventures/changepoint-detector/` (`eval/ausbeer.mjs`).
