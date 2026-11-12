---
title: "Our linear OPF repair was leaning on the AC optimum's voltages"
seo_title: "Linear OPF repair without the AC optimum's voltages on PGLib-OPF"
date: 2026-11-12
tags: [grid-linopf, infra-dcopf, research, power-systems, optimal-power-flow]
description: "At PGLib's flat 1.0 pu setpoints, our successive-linearisation repair of the DC dispatch cleared 2 of 11 congested cases, down from 6 with the AC optimum's voltages."
---

Earlier today the `grid-linopf` programme reported that a trust-region successive linearisation repairs the DC optimal power flow's dispatch on 7 of 11 congested PGLib-OPF cases, and on 7 of 11 held-out angle-limited ones, at the AC optimum's own cost. Every one of those AC power flows held generator voltages at the AC optimum's schedule. A market engine that knew that schedule would already have the AC optimum. So this run removed it.

**The setup.** We used all 36 PGLib-OPF v23.07 cases in the typical (TYP), congested (API) and small-angle-difference (SAD) sets, with the same repair and unchanged rules. The only change was the voltage schedule: the case file's own setpoints instead of the optimum's. PGLib ships 1.0 pu on every generator, while the AC optima sit up to 0.06 pu higher. After the repair, a reactive stage ran an AC OPF over voltages and reactive power only, with every non-slack unit's active power pinned. We wrote the predictions down before the run.

**What happened.**

| 34 cases with an AC optimum | TYP | API | SAD |
|---|---|---|---|
| repair at the optimum's voltages: thermal, slack and angle clean | 7 of 12 | 6 of 11 | 7 of 11 |
| repair at 1.0 pu: thermal, slack and angle clean | 8 of 12 | **2 of 11** | **2 of 11** |
| then the reactive stage: clean on every limit, V and Q included | 7 | 4 | 5 |
| its mean cost above the AC optimum | +1.2 % | +0.8 % | +4.3 % |

On the two sets whose limits bind, the repair lost most of its successes once it no longer had the optimum's voltages. None of its 1.0 pu dispatches met the voltage and reactive limits. The reactive stage rescued 16 of 34 cases, but it did so expensively: up to 10 % above the optimum on one SAD case. At 1.0 pu, a given transfer needs more current and a larger angle than at 1.06 pu, so the repair redispatches harder than it should. Once active power is pinned, the voltage stage cannot undo that. Applied to the plain DC dispatch without the repair, the same stage cleared only 4 of 34.

We checked that the reactive stage was not the problem. On every case where it failed after the repair, it solves at the AC optimum's own dispatch and returns the optimum's cost. So the failures come from the dispatch, not from the solver, though a solver failure is still not a proof of infeasibility.

**What it means for the programme.** We had said a few relinearisations repair the DC dispatch. That claim has so far held only with oracle voltages. Without them it fails on congested and angle-limited cases. A repair that a market can actually run has to move generator voltage setpoints together with active power, and that is the next milestone. We also tried an alternation of repair and reactive stage, and dropped it: it never takes a second step, because the stage either returns a fully feasible point or fails.

Caveats: these are benchmark cases, not a measured grid. The only non-oracle schedule tested was flat 1.0 pu. We used one AC solver (PIPS) and one load point per case.

Code, tables and log: `research/infra-dcopf/` (`experiments/run_vsched.py`, `results_vsched.txt`, `LOG.md`); programme: `research/grid-linopf/`.
