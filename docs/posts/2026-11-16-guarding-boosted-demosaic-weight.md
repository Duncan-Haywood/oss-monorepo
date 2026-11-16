---
title: "A guard fixed one camera our boosted demosaic broke, and missed two others"
seo_title: "Guarding a boosted-tree demosaic weight: fresh and held-out raws"
date: 2026-11-16
description: "A fallback to the linear model saved a Canon R8 and passed six fresh cameras, but two held-out cameras slipped past it, so the trees stay unshipped."
tags: [photo-editing, raw, demosaic, machine-learning, research]
---

ShootFlow is the open-source photo pipeline in `ventures/photo-editing`. Earlier today a gradient-boosted
model for its Bayer demosaic beat our linear model on ten unseen raw files on average, and still made one
camera, a Pentax K-1 Mark II, worse than using no model at all. The obvious next step was a guard: fall back
to the linear model whenever the trees might be out of their depth, decided from the raw file alone.

## What we fixed in advance

Before any score, we committed four guards and a rule for choosing between them using cross-validation on
the 40 training frames. We also committed to a clean check. The K-1 II result was already known, so the
original ten test frames could no longer judge a guard fairly. The sample set we use
(drewnoakes/metadata-extractor-images) still had Bayer files no earlier experiment had touched. A
selection rule written before opening them took six: a Canon R3, a Canon R8, a Canon 10D, a Kodak DCS Pro
SLR/n, a Leica D-LUX (Typ 109) and a Leica V-LUX (Typ 114). Each frame was scored clean and at two noise
levels.

## What happened

Cross-validation picked the plainest guard: if any of eight per-frame feature averages is outside what the
training frames showed, use the linear model for the whole frame.

| | guarded trees | linear model | frames worse than linear by more than 0.05 dB |
|---|---|---|---|
| six fresh cameras (18 copies) | +0.398 dB | +0.242 dB | none |
| ten test frames (30 copies) | +0.437 dB | +0.406 dB | K-1 II (-0.49), A7 III (-0.12) |

On the fresh set the guard did what it was for. The Canon R8 looked unlike anything in training, so the
guard fired. Without it, the trees would have lost 0.65 dB to the linear model on that camera. With it, no
fresh camera did worse than the linear model, and the Leica D-LUX gained +0.41 dB.

On the test frames, the K-1 II and the A7 III look ordinary by every frame statistic the guard watches. It
never fired on them, and both stayed below the linear model.

## So the trees stay out of the developer

We wrote the shipping rule down first: pass the fresh set, and fail the test set on nothing but the
already-known K-1 II. The A7 III makes it two, so the guarded trees don't ship. A guard that caught those two
would have to be chosen by looking at those two, and we have no unused Bayer files left to check it against.
The idea is parked until there are new raws to test on.

## What did land

`shootflow.tree_ensemble` turns a LightGBM model into flat arrays and evaluates it with numpy alone. On the
full 400-tree model its predictions equal LightGBM's exactly. It is also 16 times slower: 58 seconds
against 3.7 for 0.6 million pixels. So it is a reference for checking a C version against, not
something to put in the developer as it stands.

The pre-registration, every per-copy number and the commands are in
`ventures/photo-editing/eval/bayer-boosted-guard-2026-11-16.md`.
