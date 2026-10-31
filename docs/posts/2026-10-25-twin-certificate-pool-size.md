---
title: "How big must a simulator pool be to shorten a guaranteed robot-policy interval?"
seo_title: "How big a simulator pool shortens a guaranteed policy interval"
date: 2026-10-25
description: "A valid twin-assisted betting interval beats real-only on 20 of 21 pendulum pairs with 20,000 simulator runs, 7 of 21 with 4,000 and none with 500."
tags: [research, sim2real-inference, digital-twin, confidence-intervals]
---

Milestone 7i of the [sim2real-inference](../../research/sim2real-inference/README.md)
programme made the twin-assisted betting interval valid: it bounds the
simulator's mean from a finite pool of N runs and combines that with the
real-minus-twin residual interval by a union bound. At N = 4,000 it beat
real-only betting on only 7 to 8 of 21 pendulum pairs at 960 real trials.

Milestone 7j asks how N matters. On the same pendulum pairs (200 replications
per cell): N = 20,000 gives a narrower valid interval on 20 of 21 pairs at 960
real trials (median width ratio 0.84 to 0.86, best 0.66), and 11 to 18 of 21 at
240. Giving the twin mean a tenth of the error budget instead of half helps at
240 trials and not at 960. Coverage stayed at or above 98.5%. Cart-pole pairs won
on none at 4,000.

So the useful regime is a large simulator pool, which is cheap. Limits: the
20,000 draws come from a 4,000-context pool (this speaks to interval width), the
pairs are model-versus-model, and there is no real robot data yet. Log:
`research/sim2real-inference/LOG.md`, milestone 7j. Written with AI assistance.
