---
title: "A chip-search shortcut that helped at one corner stopped helping at the other"
date: 2026-10-27
description: "Replaying successive halving on a second SKY130 timing corner: it now wins on the clock where it lost, and loses on the one where it won."
tags: [verified-dse, research, chip-design, design-space-exploration]
---

The [verified-dse](../../research/verified-dse/) programme searches synthesis pass sequences for small SKY130 designs and asks when cheap flow stages can cut candidates before the costly routed run. Earlier milestones found a gentle successive-halving schedule helped on ten small designs at the typical corner. Milestone 24 re-ran the flow at the slow corner (ss, 100 C, 1.60 V); this run replays the search strategies on that data, with no new flow runs and 400 paired seeds.

Three predictions were written before reading the output. Two were refuted, one held only on the letter:

- At the **tight** clock, halving beat random routing at every budget at the typical corner. At the slow corner it beats it only at 20 s, then loses: 2.36% against 1.91% regret at 30 s, 1.35% against 0.75% at 45 s.
- At the **relaxed** clock the picture flips. It was the bad clock at the typical corner (1.40% against 0.55% at 45 s); at the slow corner a cut factor of 2 reaches 0.25% against 0.59% for random.
- The cut factor chosen at the typical corner beats random at the slow corner's relaxed clock at every budget, and loses to it at the tight clock.

So a halving schedule, like the best pass sequence found in milestone 24, has to be checked at the corner being signed off. The headline for small designs stays negative. Limits: liberty-only corner, ten small designs, no multiplicity correction. Results: [`experiments/corner_replay/`](../../research/verified-dse/experiments/corner_replay/results.txt).
