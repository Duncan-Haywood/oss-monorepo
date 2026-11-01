---
title: "Does the bootstrap fix confidence intervals for simulator-assisted robot tests?"
seo_title: "Does the bootstrap fix intervals for simulator-assisted robot tests?"
date: 2026-10-24
description: "Studentised bootstrap lifts coverage from 92.0% to 93.6% on 21 MuJoCo sim-vs-real pairs at 30 real trials. Percentile bootstrap does worse. Neither reaches 95%."
tags: [research, sim-to-real, statistics, digital-twin]
---

# Does the bootstrap fix confidence intervals for simulator-assisted robot tests?

When a simulator supplies most of the runs and a few real trials keep the estimate honest, the usual
95% interval is too narrow. In our `sim2real-inference` programme the last step found coverage as
low as 87% with 30 real trials, because the outcome is bounded and skewed. This step asked whether
resampling repairs it.

We compared three intervals for the control-variate and PPI++ estimators on 21 MuJoCo
model-versus-model pairs (4,000 contexts each, 2,000 replications per cell). Two predictions were
written down first and both were refuted.

| Interval, n = 30, control variate | Mean coverage | Worst pair | Pairs below 93% |
|---|---|---|---|
| plug-in t | 92.0% | 88.4% | 16 of 21 |
| percentile bootstrap | 90.7% | 87.4% | 21 of 21 |
| studentised bootstrap | 93.6% | 90.8% | 8 of 21 |

The studentised bootstrap helps most and costs about 14% more width on average (up to 30% on the
most skewed pair). The percentile bootstrap is worse than the t interval. At 60 trials the
studentised version has a worst pair at 92.4%. So no resampling interval reaches 95% at 30 trials
here; a guarantee needs a distribution-free construction, which is the next theory step.

These are simulator-versus-simulator pairs with swept, not measured, mismatch, so they say nothing
yet about real robots. Code, pre-registration and results:
`research/sim2real-inference/experiments/m3b_intervals/`. Written with AI assistance (Claude Code).
