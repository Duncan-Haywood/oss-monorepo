---
title: "Scheduling a force sensor's tares from a risk budget, not a per-sheet limit: what it saves a sheathing robot"
seo_title: "Force sensor tare scheduling: wall risk budget vs per-sheet limit"
date: 2026-11-24
tags: [buildbot-sheathing, research, robotics, force-sensing]
description: "A tracked force-bias filter's tares, spread over a wall risk budget, are never worse than a per-sheet limit and cut 199 re-zeros to 116 where that limit bit."
---

A robot nailing sheathing to a wall watches its force/torque sensor drift. The `buildbot-sheathing` programme's previous step found that reading the bias in free air once a sheet and subtracting the filtered estimate from the sensor offset (TRACK) removes almost every stop-and-tare. The tares it still needs were set by a per-sheet rule: tare whenever the coming sheet's risk of a bad press is over a fixed level. Because the filter's uncertainty after j sheets is the same on every run, that rule is really a fixed schedule, and on several cases it demanded a tare every sheet.

This run ([milestone 77](../../research/buildbot-sheathing/LOG.md)) replaced the per-sheet limit with a budget for the whole 100-sheet wall. Each sheet's risk j sheets after a tare is a table you can compute in advance, and it only rises with j. Under a union bound a run of sheets therefore costs a convex amount, so for a given number of tares the cheapest schedule splits the wall into equal runs. BALANCE takes the fewest tares whose equal runs fit the budget, then calibrates the budget by simulation to 1% wall failure, as the earlier policies were. Six hypotheses were registered before the run.

| Case (random-walk drift D1, reading noise s) | Open-loop optimum | Trigger on reading (READ) | Per-sheet limit (TRACK) | Wall budget (BALANCE) |
|---|---|---|---|---|
| G1, layout plan, 0.2 N, s = 0.05 N | 142 | 153.2 | 199 | **116** |
| G1, banded plan, 0.2 N, s = 0.02 N | 97 | 74.2 | 49 | **40** |
| G1, layout plan, 0.1 N, s = 0.01 N | 96 | 81.0 | 49 | **48** |
| G1, layout plan, 0.1 N, s = 0.02 N | 96 | 95.7 | 99 | 97 |

Mean re-zeros per 100 sheets, each checked on 10,000 fresh simulated walls (worst failure 1.30%).

What held and what did not:

1. **Never worse.** BALANCE needed no more tares than TRACK on all 90 cases, and at 0.01 N of reading noise no more than either closed-loop policy on all 11 cases where the open-loop optimum needs at least 10.
2. **Usually not much better.** The median saving over TRACK, on the 15 cases where TRACK needs 10 or more, is 2.0%, against the 20% registered. The per-sheet risk levels off within a few sheets, so the per-sheet rule already lands near equal runs, often a tare every other sheet.
3. **The gain is in the corner.** Where the per-sheet limit forced a tare every sheet, the budget halves the count or more: 116 against 199 on the G1's layout plan at 0.2 N with 0.05 N readings, under the open-loop optimum's 142.
4. **The weak pose stays weak.** At 0.02 N of noise each skipped tare on the G1's 1.2 m pose costs a third of the 1% budget, so the budget skips three: 97, the open-loop optimum, no better.
5. **The gravity model is still the risk.** A fixed 0.02 N error in the free-air reading's gravity model, unknown to the filter, takes that weak case to 11.9% wall failure.

The practical rule: if a robot tracks its force bias, schedule its remaining tares from a precomputed risk table and a wall budget rather than a per-sheet cap. It costs nothing and never loses. The bigger open question is the gravity-model error, which the next step should estimate rather than ignore.

**Limits.** Simulation only. Random-walk drift and the reading noise are swept, not measured on a sensor; noise is white and independent; tares are exact; the budget is a union bound calibrated on 4,000 walls. Code: [`experiments/m77_balance/run.py`](../../research/buildbot-sheathing/experiments/m77_balance/run.py); project page: [buildbot-sheathing](../../research/buildbot-sheathing/README.md).
