---
title: "Drone layers: whose delivery demand a planner should ask for first"
seo_title: "Drone altitude layers: which operators to ask for demand data"
date: 2026-11-13
tags: [research, robotics, autonomy, utm, drones, airspace, simulation]
description: "Asking drone operators for real destination data by traffic share fixes the paper layer split in 22 of 24 layouts after one answer; more is not always better."
---

Eight drone delivery operators share a city's airspace, and a traffic manager has one spare altitude-layer bit to split them into two groups. In [`aerolog-scaling`](../../research/aerolog-scaling/) a "paper" weight built from census residents and jobs picks that split without traffic data, and lands a mean 3.3% above the closed form's split over 24 random layouts. The [last step](2026-11-13-drone-layers-one-operators-demand.md) found that its misses are local: swapping one operator's census map for its real destinations fixes 5 of the 6 bad layouts. It also found that the reverse can hurt, which raised a practical question. If a planner can ask operators for their real demand one at a time, whose should they ask for first, and how many answers do they need?

Before computing anything I wrote down eight predictions and pushed them ([`disclosure.py`](../../research/aerolog-scaling/experiments/hub_airspace/disclosure.py)). Then I scored every one of the 256 ways of mixing census and real maps, in each layout, on a fresh 200,000-flight simulation.

## What happened

Mean conflicts as a ratio to the closed form's split, after m operators disclose:

| order | m = 0 | 1 | 2 | 3 | 4 | 8 |
|---|---|---|---|---|---|---|
| largest traffic share first | 1.033 | 1.011 | 1.009 | 1.005 | 1.005 | 1.001 |
| census-only influence first | 1.033 | 1.023 | 1.003 | 1.004 | 1.002 | 1.001 |
| random order (200 draws) | 1.033 | 1.028 | 1.023 | 1.020 | 1.016 | 1.001 |
| best possible set (oracle) | 1.033 | 1.000 | 0.999 | 0.998 | 0.998 | 1.001 |

Asking the biggest operator first puts 22 of 24 layouts within 5% after one answer. The influence order asks first about the operator whose pair weights, if wrong by a factor of two, would move the census pick the most. It needs only census data to compute, starts slower, and has every layout within 5% after four answers. A random order needs all eight to be safe. The oracle row shows that one well-chosen answer would fix every layout. Neither practical order finds that answer every time.

## The catch

More data is not always better. Under the share order, six single disclosures make a layout more than 2% worse. In layout 7 the first answer takes a perfect split to 4.7% worse, and the next answer repairs it. Across all subsets, 13 of 24 layouts have some disclosure set that does more than 2% worse than a smaller set inside it. A planner who stops partway should check the split with a short simulation; the [simulation-budget step](2026-11-13-drone-layers-how-much-simulation.md) found 20,000 flights cost less than the paper integral itself.

I also tested the diagnostic left open last time. Compare census and real demand only in the overlap where two service discs meet. That ranks wrong pair weights far better than whole-disc distance (Spearman 0.52 against 0.19). It did not pick out the culprit pair in either stubborn layout, so that prediction failed. It needs the real map anyway, so it explains errors rather than guiding a planner. The random order missed its m = 4 target by 0.001. Six of eight predictions held.

Limits: straight legs, no wind, no conflict avoidance, 2014 ride-hail pickups standing in for deliveries, radii, speeds and shares swept rather than sourced, one city, 24 layouts. The oracle is chosen on the scoring run itself, and the influence-against-share comparison (better in 3 layouts, worse in 0, p = 0.25) was made after the run. Preliminary. Full results: [`disclosure_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/disclosure_results.txt).
