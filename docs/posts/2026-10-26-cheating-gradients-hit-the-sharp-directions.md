---
title: "A cheating worker's gradient error is 320 times sharper than random noise, and that still doesn't predict the damage"
seo_title: "A cheating worker's gradient error is 320 times sharper"
date: 2026-10-26
description: "A subsampled-gradient cheat's error is 320x sharper than random noise, yet a one-step quadratic estimate overshoots its measured damage 44x to 110x."
tags: [verifiable-training-mechanisms, training, verification, mechanism-design]
---

[verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/) asks how to make outsourced ML training checkable. One cheat: compute the gradient on a quarter of the batch and hope the referee's tolerance accepts it. Earlier milestones showed the damage sits in the part of the error orthogonal to the honest gradient, not in its size.

This milestone measured why. On a 2-layer character transformer (10 seeds, 600 steps), the curvature u'Hu of the orthogonal error is about 1.0, against 0.003 for a random direction of the same length: a ratio of 320 (range over seeds 300 to 349 at tolerance 0.1). It is as sharp as the honest gradient direction itself (1.2 to 1.3), but only about 18% of the top Hessian eigenvalue estimate.

The prediction that failed was mine: summing the second-order term 0.5 lr² e'He over accepted steps gives 0.264 nats at tolerance 0.1, against 0.0024 measured, 110x too large. Later honest steps damp most of the injected error. So the mechanism is identified, but a curvature-based damage bound is not on offer; the paper should say so. One model, one corpus, curvature of the batch loss rather than held-out loss. Log and data: `experiments/curvature`.
