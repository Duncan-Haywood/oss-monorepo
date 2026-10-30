---
title: "How many simulator runs does a sim-to-real certificate need?"
date: 2026-10-25
description: "How many simulator runs a sim-to-real confidence interval needs: tested on 21 pendulum and 21 cart-pole twin-versus-real pairs."
tags: [research, sim-to-real, statistics]
---

A digital twin is free to run, so it should shorten the confidence interval on a real-world success rate. We tested that with a betting-style confidence interval on 21 pendulum and 21 cart-pole twin-versus-real pairs.

If you treat the twin's mean as known exactly, the twin-assisted interval is narrower on 20 of 21 pendulum pairs. That assumption is too kind. With a finite pool of 4,000 twin runs and a union bound, the interval is narrower on only 8 of 21 pairs at 960 real episodes, by at most 20%. With 500 twin runs it is narrower on none, and on cart-pole it never is. Coverage stayed at 99% or higher.

So the twin pool size, not only the twin-real correlation, decides whether simulation helps a certificate. The next step is to sweep the pool size up to 100,000 runs. All numbers come from simulated model-versus-model pairs, not real robot data.

Code and log: `research/sim2real-inference/experiments/m7i_finite_twin/`.
