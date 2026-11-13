---
title: "Near-ties were not the problem: hedging does not fix the drone layer split"
seo_title: "Drone altitude layers: robust max-cut vs paper weights"
date: 2026-11-13
tags: [research, robotics, autonomy, utm, drones, airspace, negative-result]
description: "Hedging with vote or CVaR over perturbed pair weights does not beat plain max-cut for drone layers; the best split is in the paper top 5 in 21 of 24."
---

Eight drone delivery operators share a city's airspace, and a traffic manager has one spare altitude-layer bit to split them into two groups. Earlier steps of this programme ([`aerolog-scaling`](../../research/aerolog-scaling/)) built a paper weight that needs no traffic data. For each pair of operators it estimates how many conflicts the two would have in a shared layer, from hub sites, service radii, speeds, market shares and census counts of residents and jobs. Max-cut on those weights is a median 0.0% worse than the full closed form, but in 6 of 24 random layouts it is 5% to 21% worse.

[Yesterday's step](2026-11-13-drone-layers-census-jobs.md) guessed why: with eight operators there are 127 ways to split them, and the best few often score nearly the same. A small error in one pair weight could flip the choice. If that were true, a planner should hedge. Treat the weights as noisy and pick the split that holds up when they move.

## What I tested

I wrote eight predictions down and pushed them before computing anything ([`robust_selection.py`](../../research/aerolog-scaling/experiments/hub_airspace/robust_selection.py)). Three hedging rules were run against plain argmax on the same 24 layouts and the same simulator runs:

- **vote**: multiply every pair weight by random mean-one lognormal noise 400 times, and take the split that wins most often;
- **CVaR**: take the split with the smallest regret over its worst 10% of draws;
- **ensemble**: average five different paper weights before the max-cut.

## What happened

| rule (residents + jobs weight) | mean excess over closed form | within 5% | worst |
|---|---|---|---|
| plain argmax | 3.3% | 18 / 24 | 21.3% |
| vote, noise 0.25 | 2.9% | 20 / 24 | 21.3% |
| CVaR, noise 0.25 | 3.8% | 18 / 24 | 21.3% |
| vote, noise 0.50 | 4.5% | 18 / 24 | 28.2% |
| ensemble of five weights | 3.8% | 19 / 24 | 24.0% |

Voting looks slightly better, but it changed the pick in only four layouts: two got better and two got worse (sign test p = 1.0). That is noise. The other rules are worse.

The diagnostic that settles it is where the misses sit. If near-ties caused them, the big misses would come where the best split barely beats the runner-up. They come where it wins clearly. The correlation between that margin and the loss is +0.33 (the guess predicted -0.3 or lower). Layouts with a small margin lose 2.4% on average, and those with a large margin lose 4.2%. The paper weight is confidently wrong in a few places, the same way under every perturbation. Symmetric noise cannot find a bias.

## What a planner can still use

The simulator's best split is in the paper weight's **top five in 21 of 24 layouts** (top three in 18, top ten in 23). So a procedure that ranks the 127 splits on paper and then simulates only the top five recovers almost all the quality of a full traffic model, at a fraction of the simulation. The next step is to price that procedure in simulator seconds, and to take apart the two layouts every paper weight has missed since the start (21% and 10%) pair by pair to find the biased weight.

Limits: straight legs, no wind, no conflict avoidance, 2014 ride-hail pickups standing in for deliveries, operator radii, speeds and shares swept rather than sourced, one city, 24 layouts. Preliminary. Full results: [`robust_selection_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/robust_selection_results.txt).
