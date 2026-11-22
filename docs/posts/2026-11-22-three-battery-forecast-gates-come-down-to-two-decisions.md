---
title: "Three gates for a battery fade-forecast correction make only two decisions"
seo_title: "Battery fade-forecast gates: three rules, two decisions, one table"
date: 2026-11-22
tags: [battery-simulation, pybamm, lithium-plating, research, cell-fidelity]
description: "One regenerated table of every corrected ten-cycle battery forecast rule shows the three gates tried make only two decisions, and none beats triage."
---

The [cell-fidelity programme](../../research/cell-fidelity/) tries to cut the cost of battery
electrode design searches. Each candidate design runs ten cycles of PyBaMM's full DFN model. A
straight-line law forecasts the lithium lost by cycle 99, and only the designs a drift score flags
run on to cycle 50. Over four days, milestones 7v to 7y tested a correction to that ten-cycle
forecast, and three ways of deciding when to apply it. Each step was pre-registered and reported
alone. This paper step puts them in one table, rebuilt by a script from the committed fold rows, so
the paper can quote them side by side.

## What the table says

Table 3 of the [results section](../../research/cell-fidelity/paper/results.md) (section 4.7) lists
every rule on the same held-out folds. The committed sets are the four PyBaMM parameter sets the
paper's main saving rests on (`Ai2020`, `Chen2020`, `OKane2022`, `NCA_Kim2011`), five folds each. The
f = 30 cells are `Mohtat2020` and `Ecker2015` with the plating rate scaled by 30.

| rule | committed sets: met | DFN cycles | f = 30: met | DFN cycles |
|---|---|---|---|---|
| straight forecast + triage | 19 of 20 | 43.5 | 9 of 10 | 45.5 |
| corrected, no gate | 16 of 20 | 44.9 | 10 of 10 | 10.0 |
| out-of-fold error gate | 17 of 20 | 45.4 | 10 of 10 | 10.0 |
| plating-share gate | 17 of 20 | 45.4 | 10 of 10 | 10.0 |
| drift-size gate | 17 of 20 | 46.8 | 10 of 10 | 10.0 |

The pattern is plain once the rows sit together. On the committed sets every corrected rule meets the
accuracy target less often than the straight forecast and costs 1.4 to 3.3 more DFN cycles per
design. On the plating cells every one of them stops at ten cycles and meets every fold.

## Two decisions, not three

The script also counts folds where two rules stop at the same cycle with the same outcome. The
plating-share gate and the out-of-fold error gate agree on all 30 folds of the committed and f = 30
sets. The drift-size gate agrees with the ungated corrected rule on all 30. So the three gates
amount to two policies: correct everywhere, or correct everywhere except `Ai2020`. Milestone 7y's
physical signal reached the same split as milestone 7x's statistics, by a different route.

A per-set oracle that picks corrected or straight with hindsight sets the ceiling. Over the six
set-conditions it saves 11.83 DFN cycles per design against the straight forecast (10 folds cheaper,
none dearer). The best gate you could actually deploy saves 10.58, 89% of that, but meets two fewer
committed folds. None of the deployable rules' six-set intervals excludes zero, because the bootstrap
resamples only six parameter sets.

## Why a table step is worth a run

Every number in the table reproduces what the original steps logged: counts, means, bootstrap
intervals and sign tests. The tests check that, so a later change to any experiment that shifts a
fold will fail the paper's tests rather than leave a stale table. The two new facts (the gates'
identical decisions, and the oracle ceiling across conditions) only became visible once the rules
shared one set of folds.

All of this is PyBaMM simulation, not measured cells, and the table is descriptive: it was built after
every step had reported, and it tests no new hypothesis. The programme's next step is breadth: a
seventh parameter set, since the gate question is closed for the current pools.

Code: [`paper/tables.py`](../../research/cell-fidelity/paper/tables.py); output:
[`paper/tables.txt`](../../research/cell-fidelity/paper/tables.txt).
