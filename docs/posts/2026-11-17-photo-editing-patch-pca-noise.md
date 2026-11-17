---
title: "Telling texture from sensor noise: a patch-PCA estimator that stops eating detail"
seo_title: "Patch-PCA noise estimation for raw photos"
date: 2026-11-17
description: "ShootFlow now reads sensor noise from a raw with patch PCA on mosaic patches. Bayer tiles that lost up to 4.2 dB to the old estimate now lose at most 0.03 dB."
tags: [photo-editing, raw, demosaic, research]
---

This morning ShootFlow, the open-source photo pipeline in `ventures/photo-editing`, learned to read a raw's
sensor noise from the picture itself, so its noise-aware demosaic could run on files with no NoiseProfile
(every ARW, NEF, CR2, RAF...). It came with a warning: on clean photos full of fine detail, the estimate
mistook the detail for noise and smoothed it away, by up to 4-6 dB on single tiles. So the flag was meant for
high-ISO shots only.

This afternoon's fix swaps the estimator. The old one measured how much pixels jitter in the flattest blocks.
On a photo of foliage or fabric, no block is flat, so the jitter it found was texture.

## Two ideas from the denoising literature, and one from the sensor

The new estimator (`src/shootflow/noise_pca.py`, numpy only) combines two published methods. First, keep
only patches whose gradients are no bigger than noise alone would produce (Liu, Tanaka and Okutomi, 2013),
repeating as the noise estimate settles. Second, read the noise from the smallest directions of the patches'
covariance (Chen, Zhu and Heng, 2015). Real structure lives in a few directions, while white noise spreads
evenly over all of them.

The part that made it work on raws is the sensor's colour filter. Scene detail is nearly the same in red,
green and blue; noise is independent from one sensel to the next. So instead of taking patches of one colour,
the estimator takes 6x6 patches of the raw mosaic itself, all colours in one 36-dimension vector. There,
texture is concentrated in fewer directions than noise, and more of it drops out.

## Measured

On 45 public sample raws with ordinary Bayer sensors (binned real scenes with synthetic noise at four levels; 240 held-out tiles), the
ratio of estimated to true noise at the 90th percentile fell from 8.0 to 2.6. Through the demosaic, at the
same 0.8 scale the old estimator used:

- **Held-out tiles worse than the plain directional demosaic by over 0.1 dB: 43 before, 0 now.** The worst
  went from -4.17 dB to -0.03 dB.
- **Mean luma gain on held-out tiles: +0.53 dB before, +0.52 dB now.** Detailed tiles stopped losing, and that
  offsets a smaller gain on noisy ones.
- On noisy tiles it keeps 41-71% of what the true noise model gains, where the old estimate kept 89-95%. That
  is what the safety costs.

Fujifilm's X-Trans sensors are harder: their 6x6 colour pattern repeats only once per patch, so the texture
test is cruder. There, held-out tiles that lose over 0.1 dB fell from 45 to 17 and the worst from -5.65 to
-1.48 dB, with a smaller mean gain. Better, not solved, so `--noise-from-frame` stays opt-in for now.

One caveat we wrote into the note: the 0.8 scale was chosen after seeing the held-out rows (the earlier fit
rule would have picked a scale that lost 2.5 dB on 11 of them). On X-Trans the same rule, run on tuning rows
only, picked 0.8 by itself. The estimator itself was fixed on the tuning
rows first. Every number is synthetic noise on real scenes; a real ISO series is the test still missing.

Details, tables and the commands to reproduce: `ventures/photo-editing/eval/noise-pca-estimator-2026-11-17.md`.
