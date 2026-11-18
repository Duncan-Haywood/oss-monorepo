---
title: "Drone layers: a longer simulation check did not help, and counting noise is why"
seo_title: "Drone altitude layers: why a simulation guard can't referee a 2% gap"
date: 2026-11-14
tags: [research, robotics, autonomy, utm, drones, airspace, simulation, statistics]
description: "Pooling 100,000 simulated drone flights did not improve a layer-split stopping rule. One 20,000-flight run measures a 2% gap with 5 to 6% noise."
---

The [last step](2026-11-14-drone-layers-when-to-stop-asking.md) of [`aerolog-scaling`](../../research/aerolog-scaling/) found a free stopping rule for a drone traffic planner. Ask delivery operators for their real destination data in order of traffic share, and stop once the paper altitude-layer split stops changing. That uses 1.5 answers on average and lands 0.9% above the closed form's split. A 20,000-flight simulation check made it worse. The obvious next guesses were a longer check, or a smarter asking order. I wrote down seven predictions and pushed them before running anything ([`sized_guard.py`](../../research/aerolog-scaling/experiments/hub_airspace/sized_guard.py)).

## What happened

| rule | mean ratio | within 5% | answers | 20k-flight runs per decision |
|---|---|---|---|---|
| share order, stop when the split stops changing | 1.009 | 22/24 | 1.5 | 0 |
| interleave share and influence orders, same stop | 1.009 | 22/24 | 1.6 | 0 |
| share x influence order, same stop | 1.013 | 21/24 | 1.5 | 0 |
| share stop + one 20k check | 1.009 | 66/72 | 1.5 | 0.4 |
| share stop + 100k pooled check | 1.009 | 66/72 | 1.5 | 2.1 |
| share stop + sequential check (until 2 SE apart, max 5) | 1.009 | 66/72 | 1.5 | 1.5 |
| all eight answers + sequential check along the path | 1.002 | 72/72 | 8 | 2.1 |
| all eight answers, no simulation | 1.001 | 24/24 | 8 | 0 |

The combined orders did nothing useful. Interleaving stops at the same splits as share order. Weighting share by influence is worse, because it asks a big operator whose answer changes nothing second and then stops. A check five times longer leaves the mean where it was. So does a sequential check that keeps adding runs until the leader is two standard errors ahead, and it nearly always hits the cap. With all eight maps the guarded rule gets every replicate within 5%. The real-map paper split does slightly better with no simulation at all.

## Why a longer check doesn't help

This part was not pre-registered. In layout 22 the 100,000-flight check still picked the "wrong" split in two of three replicates, where the two candidates looked 4.5% apart. So I ran ten more 200,000-flight simulations and a hundred more 20,000-flight ones for just those two splits ([`guard_noise.py`](../../research/aerolog-scaling/experiments/hub_airspace/guard_noise.py)).

- The short runs are not biased. Pooled, they agree with the long runs (0.984 against 0.980).
- Conflicts are rare. A 200,000-flight run keeps about 3,000 en-route conflicts under these splits, and a 20,000-flight run keeps about 300. So one short run measures the ratio of two candidate splits with a standard deviation of 5 to 6%. Telling a 2% gap apart at two standard errors would take somewhere around 560,000 to 830,000 flights.
- Layout 22's candidates are really about 2% apart, not 4.3%. The single 200,000-flight run I had been scoring everything against overstated the gap.

The useful lesson is about the measuring stick, not the planner. Per-layout differences under about 2% in this programme's last ten tables are inside the scoring run's own noise. Means over 24 layouts are tighter, but rules whose means differ by a few tenths of a percent are not clearly ranked. The next step re-scores the headline rules against a pooled million-flight reference so each layout's ratio has an interval.

For a planner the advice stays simple. With all the maps, use the paper split and skip the simulation. Without them, stop when the split stops changing. Any check of up to 100,000 flights won't improve it. Four of seven predictions held, one only by the letter.

Limits: straight legs, no wind, no conflict avoidance, 2014 ride-hail pickups standing in for deliveries, radii, speeds and shares swept rather than sourced, one city, 24 layouts. The noise diagnostic covers two layouts. Preliminary. Full results: [`sized_guard_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/sized_guard_results.txt), [`guard_noise_results.txt`](../../research/aerolog-scaling/experiments/hub_airspace/guard_noise_results.txt).
