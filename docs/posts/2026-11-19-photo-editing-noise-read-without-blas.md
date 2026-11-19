---
title: "Taking BLAS out of a raw developer's noise read: same bytes on 12 cameras, and no longer machine-dependent"
seo_title: "Taking BLAS out of a raw developer's noise read"
date: 2026-11-19
tags: [photo-editing, raw, performance, reproducibility]
description: "ShootFlow's patch-PCA noise estimate now sums in a fixed pairwise order in C and numpy alike. 12 of 12 raws develop to the same bytes; the step is 1.25x faster."
---

ShootFlow's `--demosaic noise-aware` mode needs to know how noisy a frame is
before it decides, block by block, how much to trust its directional demosaic.
When a raw carries no noise profile, it reads one from the frame itself. It cuts
the mosaic into 6 x 6 patches and sorts them into eight brightness bins. In each
bin it keeps the patches with the least texture and reads the noise from the
smallest eigenvalues of their covariance. That is the patch-PCA method of Liu,
Tanaka and Okutomi (2013) with Chen, Zhu and Heng's (2015) eigenvalue rule.

Earlier today the other steps of that noise read moved into a small C helper,
one at a time, each giving the same bits as numpy. This one was left
([full note](../../ventures/photo-editing/eval/noise-pca-native-2026-11-19.md)).

## Why it was the awkward one

The two expensive operations in the patch read were BLAS products: `np.cov`,
which hands the centred patches to a matrix multiply, and the texture energy,
a product with a matrix of neighbour differences. BLAS chooses its own order of
summation. That order depends on the library, the CPU's vector width and the
number of threads. So the same raw could get a noise model a few units in the
last place apart on two machines. An earlier check measured the margin: the
error would have to be about 10,000 times larger before one 16-bit output code
moved. That is comfortable, but it is a margin, not a guarantee.

## What changed

Both sums now follow one written-down order, numpy's own pairwise summation:
eight running sums over blocks of up to 128 rows, joined in a fixed tree. The
numpy fallback uses `np.add.reduce` along a contiguous axis, which takes exactly
that order. Before writing any C, a Python transcription of the tree was checked
against numpy 2.5.3 on 27 arrays of 129 to 100,001 values, and all 27 matched.
The C kernel then walks the same tree for all 666 entries of the 36 x 36
covariance at once. Tests check C against numpy bit for bit on 30 random patch
sets of every tree shape, and the whole estimate with and without C and on one
thread or four.

Two smaller changes did most of the speed-up. The texture energy is now computed
once for every patch instead of once per bin, since a patch's energy does not
depend on its bin. And each bin is passed as a list of indices instead of a
copy, so the eight bins can run side by side on the thread pool.

## Results on real raws

On the 12 largest public sample raws tried (Nikon, Sony and Fujifilm X-Trans,
10 to 36 megapixels):

- **12 of 12 develop to the same bytes** as before.
- The noise model moves by at most 1.8e-12 relative, the size of a reordered
  sum.
- The patch read is a median **1.25x faster** on each camera's own plane (0.202
  to 0.152 s), from 0.98x to 2.07x.
- The whole noise-aware develop is a median 1.03x faster. It now takes 1.26x
  directional's time.

A single C covariance call is no faster than four-threaded BLAS (5.6 ms against
5.1-6.4 ms). The gain came from doing less work, not from a faster inner loop.

## What is left

One library call remains in the noise read: LAPACK's `eigvalsh` on each 36 x 36
covariance. Its input is now the same everywhere, but different LAPACK builds
could still return eigenvalues an ulp apart. That is four orders of magnitude
inside the budget, so a hand-written eigensolver was not worth it today. The
next question for this mode is about quality, not speed: whether `auto` should
choose noise-aware by default.

ShootFlow is MIT-licensed and runs on your own machine. The code and every
measurement are in
[`ventures/photo-editing`](../../ventures/photo-editing/README.md).
