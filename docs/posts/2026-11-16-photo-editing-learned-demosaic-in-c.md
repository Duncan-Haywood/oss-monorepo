---
title: "The learned Bayer demosaic in C: bit-identical to numpy, and why it is only 2x faster"
seo_title: "Learned Bayer demosaic in C, bit-identical to numpy"
date: 2026-11-16
description: "ShootFlow's learned demosaic weight now runs in C, equal to numpy bit for bit on seven real raw frames. It is 2-3x faster, not 4-5x: the features cost the time."
tags: [photo-editing, raw, demosaic, performance]
---

ShootFlow, the open-source photo pipeline in `ventures/photo-editing`, has had an opt-in demosaic
since this morning, `--demosaic learned`. It sets one number per pixel: how much of a red or blue
sensel's own detail its green should carry. A small fitted model picks that number from eight local
measurements. On ten held-out frames it beat the default on colour accuracy every time
([the note](../../ventures/photo-editing/eval/bayer-learned-laplace-2026-11-16.md)). But it ran only in
numpy and took 4 to 6 times as long as the default, which has been in C since yesterday.

## What changed

The C demosaic now computes the same eight measurements and the same 45-term model for every
pixel, then uses that weight where it used a fixed one. The numpy code stays the reference, and the
C code has to reproduce it exactly. It does the same float32 operations in the same order, stores
every intermediate that numpy shifts as its own plane, and repeats edge pixels the way numpy's shifts
do.

On seven real raw frames from a public sample set (Canon 70D and 7D, Nikon D810, Sony A7 III and
A7 IV, Olympus E-M10, Pentax K-1 II), best of two runs on four cores:

| frame | numpy | C | default demosaic, C |
|---|---|---|---|
| Sony A7 III, 24 MP | 3.90 s | 2.01 s | 0.61 s |
| Canon 70D, 20 MP | 3.33 s | 1.24 s | 0.45 s |
| Nikon D810, 36 MP | 6.61 s | 3.35 s | 1.04 s |

All seven outputs equal numpy's bit for bit (largest difference 0.0). So every quality number
measured on the numpy version holds for the C one.

## Why only 2x

The default demosaic got 4.2 to 4.9x from C. This one gets 1.9 to 2.8x. The extra work is fifteen
passes over the band to build the measurements. Each pass is a window sum or a ratio: little
arithmetic per pixel and a lot of memory traffic, which numpy already handles fairly well. The model
itself (45 multiply-adds per pixel) is cheap.

The learned option now costs 2.6 to 3.3x the default's time, down from 3.9 to 6. That is still slower,
and it still loses on a synthetic zone plate up to the sampling limit, so it stays opt-in. Fusing the
passes is the obvious next step. Making it the default depends on a real photograph with fine
repeating detail and known truth.

Measurements, commands and the rows: `ventures/photo-editing/eval/bayer-learned-native-2026-11-16.md`.
