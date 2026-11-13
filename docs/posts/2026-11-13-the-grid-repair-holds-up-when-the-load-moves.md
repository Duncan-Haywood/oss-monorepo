---
title: "The grid repair's 21 of 34 held up when every bus's load moved by up to 10 %"
seo_title: "Repaired DC dispatch under load perturbation: PGLib-OPF AC feasibility"
date: 2026-11-13
tags: [grid-linopf, infra-dcopf, research, power-systems]
description: "On 244 load-perturbed copies of 34 PGLib cases, the AC repair of a DC dispatch is feasible on 66 % (95 % interval 52 to 79 %), 91 % with a voltage stage."
---

This programme asks when the dispatch from a linear power-flow model, the kind electricity markets clear on, survives the real AC physics, and how cheaply it can be repaired when it doesn't. The repair is a successive linearisation that moves generator outputs and voltage setpoints together, run from the plain DC dispatch. On the 34 PGLib-OPF benchmark cases with an AC optimum it reached a fully feasible point on 21. Adding a voltage-only AC stage after it raised that to 31. But each of those counts comes from one load point per case, and several cases only finished at round 8, 9 or 10 of a 10-round budget. A count of 21 could have been a knife edge.

So I made 10 copies of every case. In each copy, every bus's load is multiplied by its own random factor between 0.9 and 1.1, with reactive load scaled by the same factor. I ran the same frozen methods on all 360 copies and wrote five predictions down before the first run.

**The counts hold.** On the 244 copies that could be scored, the repair is fully feasible on 66 %. A cluster bootstrap that resamples whole cases, so that ten copies of one easy case don't count as ten independent wins, puts the 95 % interval at 52 to 79 %. The one-load-point figure was 62 %. With the voltage stage the rate is 91 % (83 to 97 %), the same as the single-point 31 of 34. The single-point verdict matches the majority verdict across copies on 30 of the 34 cases. All five predictions held.

**The repair is not a marginal improvement.** The plain DC dispatch at the case file's voltages is feasible on none of the 244 copies. A voltage-only AC stage on the DC dispatch, the natural no-repair baseline, manages 18 %, all of it on six easy cases. Case by case, the repair plus voltage stage beats that baseline on 29 cases and loses on none (exact sign test P = 3.7 × 10⁻⁹). Where the repair finishes, its cost averages 0.08 % above the copy's AC optimum on the typical cases, 0.23 % on the congested ones and 0.69 % on the angle-limited ones. That last figure is pulled up by one case, case14 SAD, where the repair stops at its first feasible point at 4.6 to 7.1 % above the optimum. That is the path-dependent cost found two milestones ago, and the reason a cost phase after feasibility is next on the list.

**Where it is fragile is the round budget, not the load point.** Cases the single-point run finished at round 8 or later stay feasible on 68 % of their copies. Cases that finished earlier stay feasible on 97 %.

**The caveat is the stressed tail.** PIPS, the AC OPF solver used as the reference, finds no optimum on 101 of the 360 copies. That includes 71 of the 120 copies of the congested (API) cases. PGLib built those cases at the edge of loadability, and 31 of the 71 actually carry less total load than the original: shifting load between buses is enough. After the main run I added a diagnostic and ran every method on those 101 copies anyway. Only 4 reached a feasible point, and 21 have no DC solution at all. Most of them are probably infeasible rather than solver failures, but that is not proven. The intervals above describe the copies that have an AC optimum, and the congested-case rates rest on only 42 copies.

The result is narrow. It uses ten copies per case and one perturbation model: independent uniform scaling with no correlation between buses. PIPS is the only AC reference, and on one copy the repair found a feasible point 0.85 % cheaper than PIPS's reported optimum. Next are the held-out cases of 500 to 2,000 buses, the cost phase and a sweep of the round budget.

Code, tables and log: `research/infra-dcopf/` (`experiments/run_perturb.py`, `results_perturb.txt`, `results_perturb_noref.txt`); programme: `research/grid-linopf/`. Written with AI assistance (Claude Code).
