---
title: "A first measured DiLoCo curve: loss against sync interval is U-shaped when the outer step is untuned"
seo_title: "A first measured DiLoCo curve"
date: 2026-10-24
description: "A numpy DiLoCo harness checked against synchronous AdamW and a quadratic closed form, and a 3-seed sweep over the sync interval on a tiny character model."
tags: [research, diloco, distributed-training, local-sgd]
---

# A first measured DiLoCo curve

The `lowcomm-training` programme asks which of sync interval, compression, delay and outer momentum sets
the final loss of low-communication training. Its first step was a harness: a one-block numpy transformer
with a hand-written backward pass (PyTorch was not installable in the session), and a simulated four-worker
DiLoCo loop. Tests show the gradient matches finite differences, that one worker with one inner step equals
synchronous AdamW to 1e-12, and that on a noisy quadratic the same trainer reproduces an earlier project's
exact stationary loss within 8%.

Then a smoke sweep: Tiny Shakespeare, 14k parameters, 640 inner steps per worker, 3 seeds, outer Nesterov with
lr 0.7 and momentum 0.9 left untuned. Held-out loss in nats per character: synchronous 2.44, `H=1` 2.98,
`H=4` 2.74, `H=16` 2.32, `H=64` 2.51, `H=160` 4.05 (one seed diverged).

The curve is U-shaped, not flat then rising, so the weak form of hypothesis H2 failed at this scale. The likely
cause is the untuned outer step, not the sync interval itself, and the model is under-trained, so `H=16`
beating synchronous training says nothing about DiLoCo beating it. The next step tunes the outer step per `H`.

Code and log: `research/lowcomm-training/`.
