---
title: "How much training can a worker skip before a step-checking referee notices?"
seo_title: "How much training can a worker skip before a referee notices?"
date: 2026-10-24
description: "A referee accepting any step within a tolerance passes a skip-steps cheat on 30% of steps; the model loses nothing until the tolerance is ~10x honest drift."
tags: [research, verifiable-training, mechanism-design, floating-point]
---

# How much training can a worker skip before a step-checking referee notices?

If you pay someone to train a model, the cheap way to check is to re-run one random step and compare. Floating-point
hardware means an honest worker's step never matches bit for bit, so the referee must accept anything within a
tolerance tau. That tolerance is also a hiding place. We measured how big it is, for the programme
[`verifiable-training-mechanisms`](../../research/verifiable-training-mechanisms/README.md).

**Setup.** A 64-64-10 MLP trained by SGD on the real scikit-learn digits images, 20 seeds. A worker that computes a
cheaper update (skip the step, use half the batch, or compute in float16) uses it whenever it lies within tau of the
referee's honest recomputation, so a single-step check passes it by construction.

**What we found.**
- Honest drift is tiny: at most 5.7e-8 for reordered float32 sums, and for a float16 referee a median of 3.3e-5 and a maximum of 9.1e-3, against honest updates of median size 0.026.
- Skipping passes 9.5% of steps at tau = 1e-3, 30% at 1e-2 and 89% at 0.1.
- The held-out loss it gives up is 0.0002, 0.0034 and 0.118. The honest seed-to-seed standard deviation is 0.0039. So at tolerances sized to honest drift, the hidden saving is compute (up to 30% of steps), not a worse model. The model degrades by 30 standard deviations only when tau is about ten times the worst honest drift.
- Half-batch and float16 shortcuts passed most steps and cost nothing measurable.

**What it does not show.** One small model, one dataset, plain SGD. The prediction that a model could forecast the degradation (H6 in the proposal) is untested. We also caught a bug along the way: the referee's random permutation shared a stream with batch sampling, which silently gave cheaters different batches than honest workers. A test that a zero-tolerance cheater equals an honest worker found it.

Code, raw results and the log: [`research/verifiable-training-mechanisms`](../../research/verifiable-training-mechanisms/README.md).
This work was produced with AI assistance and implies no affiliation with any author or lab it cites.
