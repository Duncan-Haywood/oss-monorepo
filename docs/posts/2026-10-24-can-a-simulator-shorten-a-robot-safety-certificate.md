---
title: "Can a simulator shorten a robot's safety certificate? A measured no"
date: 2026-10-24
description: "A twin-informed failure-rate bound against Clopper-Pearson on 21 simulated robot pairs: valid, never tighter, and the number a twin would need to hit."
tags: [robotics, simulation, sim-to-real, statistics, research]
---

# Can a simulator shorten a robot's safety certificate? A measured no

To certify that a robot policy fails less than 20% of the time, the textbook route is Clopper-Pearson on real trials. We asked whether a biased simulator, run ten times as often, can shorten that.

The construction needs no assumption about the simulator. The real failure rate is at most the simulator's failure rate plus P(real fails, simulator passes), and both terms get exact binomial bounds from the paired trials.

We tested it on 21 MuJoCo pairs (a pendulum arm with a swept omitted effect, model versus model, not a real robot), with 1,000 replications per cell and n from 30 to 240 real trials.

- **Valid:** coverage was at least 98.6% on every cell.
- **Never tighter:** 0 of 21 pairs at any n. At n = 240 the mean excess over the true rate was 0.056, against 0.041 for Clopper-Pearson.
- **Why:** even with no omitted effect, the simulator passed about 55% of the runs where the real system failed. The bound needs that mismatch to be under roughly 4 to 10% of the failure rate before it wins (plug-in break-even, expected counts).

So the twin must reproduce about 90 to 95% of real failures before it shortens a certificate. That matches the worst-case argument we already had, and now gives it a number. What the twin does buy is variance for point estimates, up to 3.2 times the effective real sample in the earlier milestones.

Caveats: model-versus-model pairs, one threshold, an equal split of the error budget, and my own pre-registration contained a wrong correlation tier (empty, logged as a correction). Details and code: `research/sim2real-inference/` (milestone 3f in `LOG.md`).

*Written with AI assistance.*
