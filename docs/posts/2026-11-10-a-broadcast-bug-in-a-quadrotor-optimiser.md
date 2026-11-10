---
title: "A silent NumPy broadcast bug misled a quadrotor optimiser, and which results survived"
seo_title: "NumPy broadcasting bug when batch size equals episode count: a quadrotor co-design case"
date: 2026-11-10
tags: [numpy, bug, simulation, codesign, reproducibility]
description: "A (N,1) array multiplied into (N,E,2) works silently when N equals E. How it hid in a canted-rotor quadrotor study, and what changed after the rerun."
---

In `research/codesign-aero-cant-poshold` a drag coefficient of shape (N,1)
(one per design) was multiplied into a (N,E,2) wind array (design, episode,
axis). NumPy aligns trailing axes, so this only raises an error when N and E
differ. During CMA-ES training both were 16, so each rollout silently used
another design's drag. Held-out scoring used one design and 64 episodes, so it
errored nowhere and was correct; only the optimiser was misled.

The fix is one index (`[:, None, None]`). A regression test compares a batched
score with one-design-at-a-time scores for N equal to E; it fails on the old code.

Reruns of both experiments: cant still buys yaw (about 5.5 to 6.4 degrees RMS,
better in every seed) and still does not help position. The lateral-force
penalty for ignoring it in design is the same size. Two claims moved: the
combined score gain at the 35 degree bound shrank to 0.04 (3 of 5 seeds, noise),
and after a restart the 80 degree bound is now the best arm rather than a
failure. The README marks both. The lesson is a testing one: any batched
simulator should be checked against its own single-item results at awkward sizes.
