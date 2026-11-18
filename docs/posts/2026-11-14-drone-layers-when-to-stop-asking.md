---
title: "Drone layers: when a planner can stop asking operators for demand data"
seo_title: "Drone altitude layers: a stopping rule for operator demand data"
date: 2026-11-14
tags: [research, robotics, autonomy, utm, drones, airspace, simulation]
description: "Stop asking drone operators for destination data once the paper layer split stops changing: 1.5 answers on average, 0.9% above the closed form, no simulation."
---

Eight drone delivery operators share a city, and a traffic manager has one altitude-layer bit to split them into two groups. In [`aerolog-scaling`](../../research/aerolog-scaling/) a "paper" weight built from census residents and jobs picks that split without traffic data. The [last step](2026-11-13-drone-layers-whose-demand-to-ask-for.md) asked operators for their real destination data one at a time, largest first, and found that one answer fixes most layouts but that more answers can make the split worse before they make it better. That left the practical question open: when can the planner stop asking?

I tried two kinds of rule, with seven predictions pushed first ([`stopping.py`](../../research/aerolog-scaling/experiments/hub_airspace/stopping.py)). The free rule stops as soon as an answer leaves the paper split unchanged. The guarded rule stops at the same point, then lets one 20,000-flight simulation choose among the splits seen so far. Everything is scored on a fresh 200,000-flight simulation as a ratio to the closed form's split, over the same 24 random layouts.

## What happened

| rule | mean ratio | within 5% | answers asked | splits simulated |
|---|---|---|---|---|
| census only (no answers) | 1.033 | 18/24 | 0 | 0 |
| largest first, stop when the split stops changing | 1.009 | 22/24 | 1.5 | 0 |
| same, plus a 20,000-flight check | 1.012 | 65/72 | 1.5 | 1.5 |
| 20,000-flight simulation alone, all 127 splits | 1.019 | 64/72 | 0 | 127 |
| all eight answers | 1.001 | 24/24 | 8 | 0 |

The free rule does the job: about one and a half answers on average, 0.9% above the closed form, as good as always asking two operators. It works because a share-ordered path rarely changes its mind: the paper split takes fewer than two distinct values on average across all nine steps.

The check made things worse. In three layouts the two candidates differ by 4.5% to 7.7%, and in some replicates the short simulation still preferred the wrong one. Against the simulation choosing freely among all 127 splits, the check is much better (26 runs better, 8 worse, p = 0.003), so the paper ranking still earns its place. But a single short run cannot referee between two paper splits a few percent apart.

## Where it fails

The rule depends on the asking order. Under the census-only influence order from the last step, the first answer often leaves a wrong split unchanged, so the rule stops at once and keeps the mistake (mean 2.0% above the closed form). Waiting for two unchanged answers in a row fixes that (0.4%, about three answers). Under share order the second wait buys nothing.

Two layouts defeat every stopping rule I tried. Their paper split does not reach a good value until the third or sixth answer, so nothing early tells the planner to keep asking. They stay 7% and 10% off. Three of seven predictions held.

Limits: straight legs, no wind, no conflict avoidance, 2014 ride-hail pickups standing in for deliveries, radii, speeds and shares swept rather than sourced, one city, 24 layouts, one short-run length with three replicates. Preliminary. Full results: [`stopping_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/stopping_results.txt).
