---
title: "Why a standard confidence bound cannot see what a digital twin saves"
date: 2026-10-24
description: "A digital twin cuts a robot-policy estimate's variance up to 3x, yet a guaranteed empirical-Bernstein interval comes out 2 to 3 times wider. A negative result."
tags: [digital-twin, sim-to-real, statistics, robotics, negative-result]
---

# Why a standard confidence bound cannot see what a digital twin saves

A digital twin runs a robot policy cheaply, but it is biased. Paired with a few real trials, it shrinks the variance of the estimated performance by roughly 1/(1 - rho^2), where rho is the correlation between twin and real outcomes. We checked this on 21 MuJoCo twin-real pairs (programme `research/sim2real-inference`).

Plug-in intervals undercover on bounded, skewed outcomes (91 to 93% at n = 30), so we tried a guarantee: an empirical-Bernstein interval for the control-variate estimate, valid for any distribution on [0, 1].

**Result.** It is valid (100% coverage on all 21 pairs, 1,000 replications) and 2.1 to 3.1 times wider than the same bound on real trials alone, even where rho is 0.85 or higher. The Bernstein bound is dominated by its range term (0.146 versus a variance term of 0.027 at n = 60), so the twin's variance gain is invisible to it, while the construction pays for a wider range, a split error budget and a pilot for the weight.

**What it means.** A twin-informed guarantee needs an interval whose width follows the observed variance (betting confidence sequences) or the observed range of the paired residual. That is the next step. Caveats: one task, one outcome, model-versus-model pairs, untuned split.

Code, log and pre-registered hypotheses: `research/sim2real-inference/experiments/m3c_dfree/` and `LOG.md`.
