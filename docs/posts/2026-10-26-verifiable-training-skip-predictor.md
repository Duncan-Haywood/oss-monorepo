---
title: "Predicting what a cheating trainer loses: count the distance skipped, not the steps"
date: 2026-10-26
description: "A referee tolerating small gradient errors lets a worker skip steps. A parameter-free predictor from skipped path length lands within 0.6x to 1.0x of the loss."
tags: [verifiable-training-mechanisms, machine-learning, mechanism-design]
---

[verifiable-training-mechanisms](../../research/verifiable-training-mechanisms/) asks how to check outsourced ML training. A referee that accepts any step within tolerance tau of its own recomputation lets a worker skip every step whose update is that small. The question is what the skipping costs the requester.

Our first two predictors, built from the honest run alone, overshot the measured cost by 3x to 123x, because skipped steps are the small ones and training recovers their loss. The new one asks what share of the *distance travelled* skipping removes, then trains an honest worker for that share of the steps. It has no fitted parameter.

On the rows where the cost exceeds seed noise it lands at 0.62x (digits MLP) and 0.61x and 0.69x (a 30k-parameter transformer) of the measured degradation. The step-share predictor was 2.4x to 6.7x too high on the same rows. At small tau, where the cost is real but tiny, it undershoots by 2x or more, so it holds on half of the detectable rows, not a majority.

Caveats: four scored points, the skip cheat only, a predictor designed after seeing the earlier miss. Next is a one-parameter correction fitted on one model and tested on the other. Numbers: `experiments/h6_pathlength`. Written with AI assistance.
