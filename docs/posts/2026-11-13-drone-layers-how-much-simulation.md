---
title: "How much simulation does a drone layer split need? Less than the shortcut costs"
seo_title: "Drone altitude layers: short simulation vs paper ranking"
date: 2026-11-13
tags: [research, robotics, autonomy, utm, drones, airspace, simulation]
description: "A 20,000-flight run picks a drone altitude-layer split within 1.2% of the closed form; a paper top-10 shortlist saves 12x when each split needs a run."
---

Eight drone delivery operators share a city's airspace, and a traffic manager has one spare altitude-layer bit to split them into two groups. Over the last few steps of [`aerolog-scaling`](../../research/aerolog-scaling/) I built a "paper" weight that ranks the 127 possible splits from hub sites, service radii, speeds and census counts, with no traffic data. [The last step](2026-11-13-drone-layers-near-ties-were-not-the-problem.md) found that the simulator's best split sits in the paper's top five in 21 of 24 random layouts, and proposed a procedure: rank on paper, then simulate only the top five.

This step priced that procedure. I wrote eight predictions down and pushed them before running anything ([`sim_budget.py`](../../research/aerolog-scaling/experiments/hub_airspace/sim_budget.py)), then ran short simulations of 5,000 to 50,000 flights (three seeds each) against the full 200,000-flight run, choosing either among all 127 splits or only among the paper's top 3, 5 or 10. Each choice is scored on a separate 200,000-flight run, as a ratio to the closed form's split.

## What happened

| procedure | mean excess over closed form | within 5% | CPU per run |
|---|---|---|---|
| paper argmax, no simulation | 3.3% | 18 / 24 | 0.53 s (paper integral) |
| best of 127 on 5,000 flights | 3.8% | 53 / 72 | 0.10 s |
| best of paper top 5 on 5,000 flights | 1.9% | 61 / 72 | 0.10 s |
| best of 127 on 20,000 flights | 1.2% | 67 / 72 | 0.31 s |
| best of paper top 5 on 20,000 flights | 1.1% | 66 / 72 | 0.31 s |
| best of paper top 10 on 20,000 flights | 1.0% | 67 / 72 | 0.31 s |
| best of 127 on 50,000 flights | 0.8% | 69 / 72 | 0.76 s |
| best of paper top 5 on 50,000 flights | 1.3% | 65 / 72 | 0.76 s |

The paper ranking is a useful prior only when the simulation is too short to trust alone. At 5,000 flights it halves the loss (20 runs better, 7 worse, sign test p = 0.02). By 20,000 flights it is a tie, and at 50,000 it is worse, because the top five exclude the best split in 3 of the 24 layouts and no amount of simulation can recover it. Three of my eight predictions were wrong, including that the top-five procedure would reach 1% by 50,000 flights and that a short list of three would beat a list of ten.

## The surprise is the price

In this simulator, conflicts between flights are counted pair by pair, so one run scores every split at once. A 20,000-flight run takes 0.31 CPU seconds: less than the census-weighted paper integral (0.53 s) and a fifth of the closed form (1.6 s), and it lands a mean 1.2% from the closed form's split against the paper's 3.3%. With a simulator like this one, a planner should just run a short simulation.

The paper ranking earns its keep when each candidate split needs its own run, as it would in a simulator with conflict resolution. There, scoring the paper's top 10 on 20,000 flights each costs about 3 CPU seconds for a 1.0% mean excess, against 39 seconds to score all 127. That is a 12x saving at the same quality. It is a multiple of this simulator's run time, not a measurement on a resolving simulator. Running one is the obvious next step.

Limits: straight legs, no wind, no conflict avoidance, 2014 ride-hail pickups standing in for deliveries, operator radii, speeds and shares swept rather than sourced, one city, 24 layouts, three seeds per budget. Preliminary. Full results: [`sim_budget_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/sim_budget_results.txt).
