---
title: "How much training can a cheater skip on a transformer before the loss shows it?"
date: 2026-10-25
description: "A drift-tolerant verifier also lets a worker skip small updates. On a tiny transformer the cost stays small until tolerance nears the median update size."
tags: [research, verifiable-training, mechanism-design, negative-result]
---

In `research/verifiable-training-mechanisms` a requester pays workers to train
a model and re-runs single steps to check them. Honest workers differ from the
referee by floating-point drift, so the check needs a tolerance tau. A cheater
can then skip every step whose update is smaller than tau and save that compute.
Earlier milestones measured this on small MLPs. This one uses a 2-layer,
32-wide character-level transformer on 87 kB of text, 10 seeds, plain SGD.

Drift from reordering the batch was at most 1.5e-7, while update norms ran from
0.004 (10th percentile) to 0.22 (90th). Skipping with tau = 1e-2 saved 16% of
steps and cost +0.0017 held-out loss (0.2 seed standard deviations, CI 0.0011 to
0.0022). At 3e-2 it saved 29% and cost one standard deviation; at 0.1 it saved
59% and cost 7.4. Unlike on the breast-cancer task, skipping never improved the
loss.

So a tolerance set at drift size (about 1e-6) lets nothing through, and the
margin only becomes valuable to a cheater at tolerances tens of thousands of
times larger. The caveats are large: 30k parameters, 600 steps with the loss
far from converged, a fixed split and one referee. The numbers are in the
programme's `LOG.md`, milestone 11.
