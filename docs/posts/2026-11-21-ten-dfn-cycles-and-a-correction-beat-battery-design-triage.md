---
title: "Ten DFN cycles and a correction beat a battery design triage rule on fast-plating cells"
seo_title: "Battery design search: ten DFN cycles plus a fade correction"
date: 2026-11-21
tags: [battery-simulation, pybamm, lithium-plating, research, cell-fidelity]
description: "With a corrected ten-cycle fade forecast, a PyBaMM battery design search on fast-plating cells needs 10 DFN cycles per design, not 40, at the same accuracy."
---

A battery cell design search in the [cell-fidelity programme](../../research/cell-fidelity/)
runs each candidate electrode design through PyBaMM's full DFN model for a few cycles and
forecasts how much lithium it will have lost by cycle 99. A triage rule then decides which designs
need a longer, costlier run before the forecast can be trusted. Two days ago that rule
[stopped paying](2026-11-20-the-battery-triage-interval-did-not-survive-a-second-plating-rate.md)
on two cells whose plating reaction the programme had sped up 30-fold: it cost 5.5 more DFN cycles
per design than simply running every design for 40 cycles.

The next two steps found why. The plating reaction
[slows itself](2026-11-20-why-a-ten-cycle-battery-fade-forecast-fails-when-plating-throttles.md),
which bends the fade curve. A correction the programme already had
[removes most of the bend's error](2026-11-20-correct-a-ten-cycle-battery-fade-forecast-dont-lengthen-it.md)
from the ten-cycle forecast. But the rule never used it. It used the correction to decide which
designs to flag, and then scored the unflagged ones with the uncorrected straight line.

## What this run changed

One number per design. Inside each leave-one-pool-out fold, the correction was fitted on the four
training pools. The corrected ten-cycle forecast then replaced the straight-line one in the rule's
input. Nothing else changed: the flag score, the longer windows, the accuracy target (1.25 times
the error of running every design to cycle 50) and the rule's code. Before computing anything, the
hypotheses went into the [log](../../research/cell-fidelity/LOG.md) (milestone 7v), with one risk
named: if the corrected forecast is good enough on its own, the triage rule and a uniform run
length will both stop at ten cycles and tie.

The replay of the old rules matched the earlier step's 20 folds exactly. Then:

| f = 30 cells, 10 folds | DFN cycles per design | folds meeting the target |
|---|---|---|
| uniform run length (old) | 40.0 | 10 of 10 |
| threshold rule (old) | 45.5 | 9 of 10 |
| threshold rule, corrected forecast | **10.0** | **10 of 10** |
| uniform run length, corrected forecast | 10.0 | 10 of 10 |

So the corrected rule is 30 cycles per design cheaper than the uniform run length on every one of
the 10 folds (sign test p = 0.002). That is 75% fewer DFN cycles, and it still meets the target. The
risk came true as well: on every fold the corrected rule flags nothing. Once the forecast is
corrected there is nothing left to flag, so the triage itself adds nothing on these cells.

## Where it is weaker

At the slower plating rate (multiplier 10) the correction does less, because there is less bend to
correct. The corrected rule saves 36 cycles per design on `Ecker2015` but only 2.4 on `Mohtat2020`,
and on `Mohtat2020` it meets the target on only 2 of 5 folds. The target is also relative. A
corrected ten-cycle forecast that beats a poor 50-cycle look passes even when it is not accurate in
absolute terms: its upper-quartile error reaches 0.227 on one `Ecker2015` fold. Both cells are PyBaMM
parameter sets with a plating rate chosen by the programme, so they are simulated cells, not
measured ones.

## What it means for a design search

On cells whose fade is dominated by plating that slows itself, run ten DFN cycles and correct the
forecast. Do not extend the runs. Whether that also holds on the four committed parameter sets is
the next question. Those sets are where the paper's 13 to 19% saving comes from, and the correction
is weaker on them. The answer decides whether the paper's recipe becomes "correct, then triage what
is left".

Code: [`experiments/rule7v/run.py`](../../research/cell-fidelity/experiments/rule7v/run.py), output
[`results.txt`](../../research/cell-fidelity/experiments/rule7v/results.txt).
