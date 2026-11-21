---
title: "A battery fade correction that cuts DFN cycles 75% on plating cells costs cycles everywhere else"
seo_title: "Battery design search: a fade correction that only fits plating cells"
date: 2026-11-21
tags: [battery-simulation, pybamm, lithium-plating, research, cell-fidelity]
description: "A corrected ten-cycle fade forecast saved 30 DFN cycles per design on plating cells. On four standard PyBaMM parameter sets it costs cycles and misses more."
---

This morning's step in the [cell-fidelity programme](../../research/cell-fidelity/) found
[a shortcut](2026-11-21-ten-dfn-cycles-and-a-correction-beat-battery-design-triage.md) for a
battery cell design search. The search runs each candidate electrode design through PyBaMM's
full DFN model and forecasts how much lithium it will have lost by cycle 99. On two cells
whose plating reaction had been sped up 30-fold, a corrected ten-cycle forecast was accurate
enough to stop every design at ten DFN cycles. That cut 30 cycles per design (75%) and made
the triage rule unnecessary.

The obvious next question was whether the shortcut holds on the four parameter sets where the
programme's headline saving was measured (`Ai2020`, `Chen2020`, `OKane2022`, `NCA_Kim2011`,
50 designs each, five held-out pools). It doesn't.

| rule (20 held-out folds) | DFN cycles per design | folds meeting the accuracy target |
|---|---|---|
| uniform run length | 48.0 | 19 of 20 |
| triage on the straight ten-cycle forecast | 43.5 | 19 of 20 |
| triage on the corrected forecast | 44.9 | 16 of 20 |

The corrected rule still beats the uniform run length by 3.1 cycles, so all four pre-registered
hypotheses passed. That's because they compared it with the uniform run. Against the plain triage
rule it costs 1.4 cycles more per design (one fold cheaper, seven dearer) and misses three more
folds. Pooling these four sets with the two plating cells gives a confident-looking interval
(&minus;22 to &minus;2 cycles), but the plating cells drive all of it.

The cause is visible per set. The correction fits a line on whichever of three early observables
best predicts each design's late drift on the training pools. On `Ai2020` it picks one that
doesn't carry over to the held-out pool, and the median ten-cycle error goes from about 0.04
to about 0.4. On `Chen2020` and `OKane2022` it changes little. Only `NCA_Kim2011` gains. Where one
mechanism, plating, dominates the fade, the early bend predicts the late one. Where the drift
is mixed, it doesn't.

A post-hoc gate that switched the correction on only where it helped on the training pools
matched the plain rule's 43.5 cycles but still met fewer folds. The corrected forecast looks better
on the pools the safety margin is tuned on than on the held-out one. The next step is to make that
decision out of fold.

For now the recipe doesn't change: straight ten-cycle forecast plus drift-score triage by
default, and the correction only on cells whose fade a single early-visible mechanism dominates.
Numbers: [`experiments/rule7w/results.txt`](../../research/cell-fidelity/experiments/rule7w/results.txt);
plan and outcome: the programme's [log](../../research/cell-fidelity/LOG.md), milestone 7w.
Simulation results only (PyBaMM 26.10.1.1, cell 000), not measured cells. Written with AI
assistance (Claude).
