---
title: "Drone layers: a million-flight recount keeps the ranking and shrinks the scary misses"
seo_title: "Drone altitude layer splits re-scored on 1,000,000 simulated flights"
date: 2026-11-14
tags: [research, robotics, autonomy, utm, drones, airspace, simulation, statistics]
description: "Re-scoring drone layer-split rules on 1M simulated flights moved every mean by 0.3% or less; some single-layout misses and the in-sample best were noise."
---

The [last step](2026-11-14-drone-layers-a-longer-check-did-not-help.md) of [`aerolog-scaling`](../../research/aerolog-scaling/) ended with an awkward finding about the measuring stick. Since milestone 11g, every rule for splitting delivery-drone operators between two altitude layers had been scored against one 200,000-flight simulation per layout. That run keeps only about 2,000 to 3,700 en-route conflicts, so it measures the ratio of two splits with 1 to 2% noise. Some of the per-layout misses I had been reporting were about that size.

So this step recounts. I took the split each headline rule had already chosen and re-scored it on five new 200,000-flight runs per layout: a million flights, with a 95% interval per layout. Nothing was re-chosen. I pushed eight predictions before simulating anything ([`reference_rescore.py`](../../research/aerolog-scaling/experiments/hub_airspace/reference_rescore.py)).

## The means survive

| rule (ratio to the closed form's split) | old single run | 1M reference | layouts significantly worse |
|---|---|---|---|
| paper weights on every operator's real destinations | 1.0007 | 1.0000 | 0 of 24 |
| ask by traffic share, stop when the split stops changing | 1.0088 | 1.0056 | 1 of 24 |
| ask by influence, stop after two unchanged answers | 1.0042 | 1.0017 | 0 of 24 |
| census-only paper weights | 1.0331 | 1.0312 | 5 of 24 |
| best of all 127 splits on the old scoring run | 0.9975 | 1.0023 | 1 of 24 |

Every mean moved by 0.3% or less, and the order didn't change. All of them moved down, so the old run slightly flattered the closed form's split. The real-map paper split can't be told apart from the closed form in any of the 24 layouts.

## Some single-layout stories don't

- Layout 16's 6.7% miss under the stopping rule is 2.5% ± 2.6%. That's not significant.
- Layout 22's 4.5% is 2.7% ± 2.8%.
- Layout 6's split, which looked 1.5% *better* than the closed form, is 2.1% worse.
- Layout 17's 5.4% ± 1.3% miss is real. Disclosing an operator's data early never moves the pick there.

The last row of the table is a winner's curse, and it's the most useful lesson for anyone benchmarking against a simulator. The split that looked best on the scoring run (0.25% *better* than the closed form) is 0.2% worse on fresh runs. In 7 of the 8 layouts where it disagrees with the closed form, it's the worse of the two. I also chose a split on two reference runs and scored it on the other three. It never beats the closed form's split by more than 2%, and it's significantly better in only one layout (0.8%). On this simulator the closed form is already about as good as any split.

Six of eight predictions held. The winner's curse was smaller than the 1% I'd guessed, and layout 16's miss didn't survive. From here on the programme scores against the pooled reference, with intervals.

Limits: straight legs, no wind, no conflict avoidance, 2014 ride-hail pickups standing in for deliveries, radii, speeds and shares swept rather than sourced, one city, 24 layouts. The reference shares the simulator's assumptions, so it removes counting noise, not model error. Preliminary. Full results: [`reference_rescore_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/reference_rescore_results.txt).
