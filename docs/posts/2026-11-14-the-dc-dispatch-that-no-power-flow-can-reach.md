---
title: "The DC dispatch that no power flow can reach"
seo_title: "Why AC power flow fails at a DC OPF dispatch on PGLib RTE cases"
date: 2026-11-14
tags: [research, power-systems, optimal-power-flow, grid-linopf]
description: "On six PGLib cases the AC power flow at the DC OPF dispatch never converges. From DC angles Newton solves the networks, but load runs out at 48 to 85 %."
---

The [`grid-linopf`](../../research/grid-linopf/) programme asks when a linear (DC) optimal power flow is safe to dispatch from, and how cheaply an AC repair makes it safe. The repair linearises the AC power flow at the current point, so it needs a power flow there to start. On six PGLib-OPF cases it never gets one: five 1,888 and 1,951-bus RTE networks and case300 TYP. Newton does not converge at the DC dispatch, so the repair stops before its first step.

Yesterday's reading was that the start, not the repair, decides these cases. Today's run tested whether a better start would rescue them.

## The plan failed at its first point

The pre-registered plan walked the dispatch from the case file's own generator setting to the DC point, warm-starting Newton at each step. It made five predictions, and four failed at the first point. The file's dispatch has no power flow either, on all six cases. PGLib files are not solved operating points. Their generation falls 2.0 to 18.3 GW short of load (3 to 23 %), so the slack generator has to cover the gap.

## What the diagnostics found

These were declared after the planned run, not pre-registered.

- **Flat starts fail even with no load.** With every load and generator set to zero, PYPOWER's Newton fails on the RTE networks from a flat start and from the file's voltages. A damped Newton stalls with one bus at 0.03 pu.
- **DC angles fix that.** pandapower's Newton solved the no-load networks only when it started from DC power-flow angles. Started the same way, PYPOWER solves all six at no load. The network data was fine. The start angles were the problem.
- **Load then runs out.** Scaling load and the DC dispatch up together, the power flow follows to **48 to 85 %** of full load and stops there. The step shrinks to 1/1024 and the lowest bus voltage sags to 0.72 to 0.79 pu.

| case | load reached | lowest voltage there |
|---|---|---|
| case300 TYP | 85.5 % | 0.718 pu |
| case1888_rte TYP, SAD | 79.8 % | 0.777, 0.784 pu |
| case1888_rte API | 47.5 % | 0.787 pu |
| case1951_rte TYP, SAD | 57.2 % | 0.777 pu |

That pattern looks like the nose of a loadability curve. Past it, the DC dispatch at the file's voltage setpoints has no power flow at all. This is suggestive, not proven: simple continuation cannot step past a fold, and no Jacobian test has run yet. One control supports it. On case300 TYP, the AC optimum's dispatch at the same voltage setpoints follows the same path all the way to full load. On that case the DC dispatch is the obstacle, not the voltages.

## What it means

No Newton start, damping or warm start rescues these cases. A start has to change the dispatch or the voltages before the first power flow. For anyone running PYPOWER on the PGLib RTE cases, start Newton from DC angles: a flat start fails even with no load. The next step is a repair that runs at the highest load it can reach and then steps the load up.

Code and numbers: [`run_homotopy.py`](../../research/infra-dcopf/experiments/run_homotopy.py), [`results_homotopy_dcangle.txt`](../../research/infra-dcopf/experiments/results_homotopy_dcangle.txt), and the plan and outcome in [`LOG.md`](../../research/infra-dcopf/LOG.md). Written with AI assistance (Claude Code).
