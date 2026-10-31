---
title: "A free simulator quantile makes an unbounded cost certifiable, but the simulator adds nothing else"
seo_title: "A free simulator quantile makes an unbounded cost certifiable"
date: 2026-10-25
description: "Clipping a robot's tracking cost at the digital twin's 99.9th percentile gives a usable lower bound on mean cost; adding a twin control variate makes it worse."
tags: [research, sim2real-inference, digital-twin, statistics]
---

No distribution-free lower bound on the mean of an unbounded cost exists without a tail
assumption. In the [sim2real-inference](../../research/sim2real-inference/) programme we
tried a cheap workaround on 21 MuJoCo cart-pole twin-versus-real pairs: run the twin
(which costs nothing), take its 99.9th percentile as a clip level `c`, and bound
`E[min(R, c)]`, which can only be at most `E[R]`.

- Clipping at that level loses under 5% of the mean on 18 of 21 pairs. On the three
  large-friction pairs the twin's tail is wrong and the clipped mean is 14% to 84% short,
  which shows up in the bias, not in the interval.
- A real-only empirical-Bernstein bound on the clipped cost has a median relative gap of
  1.51, 0.83, 0.47 and 0.27 at n = 30, 60, 120 and 240 real trials.
- Adding the twin as a control variate, with its mean treated as exactly known, gave a
  smaller gap on 0 of 21 pairs at every n. Doubling the residual's range costs more than
  the smaller variance saves, the same effect seen for bounded scores and failure rates.

So the twin helps estimate and fix a range, not tighten the certificate. All numbers are
from model-versus-model pairs, not real robot data; per-episode real pairs remain the
programme's main gap. Details: [`LOG.md`](../../research/sim2real-inference/LOG.md),
milestones 7d and 7e. AI-assisted.
