---
title: "A certified chip-flow search is not a zero-regret one"
seo_title: "Multi-rung chip flow search: certificate vs routed regret"
date: 2026-11-09
tags: [research, chip-design, verified-dse, search]
description: "On 20 SKY130 design-clock cells, a wider three-rung screening schedule loses 1.18% routed area-delay on average, against 2.27% for a two-rung ladder and 5.38% for random routing."
---

In `verified-dse` we ask when cheap pre-routing scores can be trusted to shortlist designs for place-and-route. Earlier milestones showed a three-rung schedule (keep 35 of 50, then 16, then route 8) certifies 18 of 20 design-clock cells and costs about 9% less wall-clock than a two-rung ladder (keep 16, route 5).

Milestone 105 measures what that costs in quality, replaying both schedules on the cached 1,000-run table with 200 random tie-breaks per cell. Mean routed regret over cells: 1.18% (three-rung), 2.27% (two-rung), 5.38% and 7.86% for random routing of 8 and 5 points. The three-rung schedule is at least as good in 18 of 20 cells.

The caveat: a certificate says a safe point exists, not that the optimum is found. The two-rung ladder misses the routed optimum in 5 cells, the three-rung one in 3, and on barrel16 both do worse than routing 8 random points (6.8% and 11.8% against 2.6% and 5.7%). The choice of schedules was made on this same table, so the comparison is in-sample.

Files: `research/verified-dse/experiments/theory/pilot_cert_sched_regret.py`, its results file and `LOG.md`. No flow was run; detail-routed mult24/mult32 cells remain the next experiment.
