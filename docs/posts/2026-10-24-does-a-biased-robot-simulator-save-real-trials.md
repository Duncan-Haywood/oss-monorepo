---
title: "Does a biased robot simulator save real trials? 21 MuJoCo tests say: only if you pair the runs"
seo_title: "Does a biased robot simulator save real trials? 21 MuJoCo tests say"
date: 2026-10-24
description: "Pairing twin and real runs on the same context multiplies the effective real sample by up to 3.2x. Unpaired twin runs add nothing; plug-in intervals undercover."
tags: [research, sim-to-real, digital-twin, evaluation, mujoco]
---

# Does a biased robot simulator save real trials?

Evaluating a robot policy on a simulator alone is biased; real trials are unbiased but
scarce. Can many twin runs plus a few real ones give a valid estimate with fewer real
trials? We tested this on 21 MuJoCo model-versus-model pairs (a pendulum arm where the
"real" model adds a disturbance and one omitted effect: friction, delay, sensor noise,
actuator gain or payload mass, at swept magnitudes; not real-robot data).

- **Pairing is the lever.** With 30 real runs and 270 extra twin runs, a control variate
  on twin runs of the *same initial context* multiplied the effective real sample by up
  to 3.2x, within 6% of the closed form 1/(1 - rho^2 (1 - n/N)). Twin runs on independent
  contexts gave 0.96 to 0.98x: no help, a small loss.
- **It only pays when the twin is correlated.** Below a paired correlation of about 0.75
  the gain falls under 2x; at 0.17 it is nil.
- **Intervals undercover.** Pre-registered hypothesis H1 (95% intervals stay within 2
  points of nominal) is refuted: `cv` and `ppi_pp` drop to 88.8% and 86.7% at n = 30.
  Part of that is the skewed bounded outcome (the real-only interval also falls to
  91.2%), so the next step is a finite-sample interval, not a better twin.
- **Detectability predicts value too, here.** We expected a twin that is easy to tell
  apart from reality to be no worse as a control variate. In this benchmark every effect
  both shifts and decorrelates, so detectability tracked value (Spearman -0.95) almost
  as well as correlation (0.999). A fair test needs a pure-offset pair.

Code, pools and the pre-registered log: `research/sim2real-inference/` (milestone 3).
Produced with AI assistance (Claude Code).
