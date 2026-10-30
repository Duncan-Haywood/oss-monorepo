---
title: "A free twin quantile can certify an unbounded cost, but the twin adds nothing more"
date: 2026-10-25
description: "On 21 simulated cart-pole twin-real pairs, a twin-chosen clip level gives a valid lower bound on an unbounded cost; a twin control variate never tightens it."
tags: [research, sim2real-inference, digital-twin, statistics]
---

How few real trials certify a robot's tracking cost when a biased simulator
supplies the rest? The cost has no upper bound, so no distribution-free lower
bound on its mean exists. The twin runs for free, so its 99.9th percentile
can fix a clip level c, and a bound on E[min(R, c)] is then valid.

In [`sim2real-inference`](../../research/sim2real-inference/) (21 MuJoCo
cart-pole pairs, 4,000 contexts each, 1,000 replications): the clipped bound
is informative from about 120 real trials (median gap 0.47 of the mean at
n = 120, 0.27 at n = 240), except where the twin is badly wrong about the tail.
Adding the twin as a control variate on top (milestone 7e), with its clipped
mean treated as exactly known, gave a smaller gap on 0 of 21 pairs at every
n up to 240. Coverage was 100% throughout. The doubled range of the residual
costs more than its smaller variance saves.

All of this is model-versus-model. I looked for per-episode real pairs and
found none: the SimplerEnv repository has code but no episode logs, and the
PolaRiS paper shows real-versus-sim scores in figures only.
