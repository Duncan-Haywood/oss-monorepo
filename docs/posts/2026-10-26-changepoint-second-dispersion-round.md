---
title: "A second round of the dispersion penalty doesn't fix GARCH false alarms"
seo_title: "A second dispersion penalty doesn't fix GARCH false alarms"
date: 2026-10-26
description: "Re-measuring the dispersion factor for a second round cuts GARCH false alarms from 30% to 27%: a negative result."
tags: [changepoint-detector, statistics, negative-result]
---

The changepoint detector's `--dispersion` option scales its penalty by how over-dispersed the squared residuals are. That factor is measured on a fit that already contains the false breaks, so we tried re-measuring it on the refit and fitting again.

On 200 seeded null series of 200 points, false alarms went from 30% to 27% on GARCH noise, 29% to 22% on t3 noise and stayed near 40% on AR(1). Detection of a real variance break moved by 4 points at most. Two extra rounds buy almost nothing, because what is left is the noise's memory, which a scale factor cannot remove. The single pass stays the default and a GARCH likelihood cost is the next route.

Script and output: `ventures/changepoint-detector/eval/meanvar-dispersion-iter.mjs`.
