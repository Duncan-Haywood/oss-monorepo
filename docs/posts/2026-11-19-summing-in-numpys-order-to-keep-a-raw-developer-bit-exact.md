---
title: "Summing in numpy's order: a C kernel that keeps ShootFlow's raw developer bit-exact"
seo_title: "Summing in numpy's order to keep a raw developer bit-exact"
date: 2026-11-19
tags: [photo-editing, raw, performance, c, numpy, reproducibility]
description: "ShootFlow's noise-aware demosaic got a C block-statistics kernel that reproduces numpy's pairwise summation: same bytes on 12 real raws, 1.11x faster."
---

[ShootFlow](https://marisstella.app/photo-editing/) develops camera raw files on
your own machine. Its `--demosaic noise-aware` mode decides, 24 x 24 sensels at
a time, how much to trust a sharp demosaic over a smooth one. To do that it
needs two numbers per block: the mean brightness and the largest value, which
tells it whether the block is clipped. Earlier today the
[noise reading](2026-11-19-same-bytes-a-third-less-time-noise-reading-in-c.md)
and the [blend](2026-11-19-a-blas-call-made-our-raw-developer-machine-dependent.md)
moved to C. This evening those per-block statistics followed.

## Why a mean needs care

In numpy the block mean was one line: clip the plane at zero, reshape it into
blocks, take `mean(axis=-1)`. That line makes two copies of the whole frame,
which is 195 MB each on a 24-megapixel camera. Each helper in this
series has to give the same bits as the numpy code it replaces, because the
numpy code stays as the reference and as the fallback for machines without a
compiler.

A float mean depends on the order of the additions, and numpy does not add
left to right. It uses pairwise summation. A run of up to 128 values goes
into eight running sums, which are joined as `((r0 + r1) + (r2 + r3)) + ((r4 +
r5) + (r6 + r7))`. A longer run is split in half, rounded down to a multiple of
eight, and each half is summed the same way. Before writing the kernel we
checked three candidate orders against `np.sum` on 2,000 random rows of five
lengths. Plain pairwise matched every row. "First element plus pairwise rest",
which is how a reduction is sometimes described, matched only 40 to 61%. The
C kernel copies the matching order and does the clip and the maximum in the
same pass.

## What it bought

We ran the 12 largest public sample raws we had (Sony ARW, Nikon NEF and
two Fujifilm X-Trans RAF files), alternating old and new code:

- **12 of 12 outputs are the same bytes** as before.
- The noise-aware develop is a median **1.11x faster** (1.02x to 1.27x). It now
  takes 1.32x the time of the plain directional demosaic, down from 1.36x.
- The block statistics themselves went from 0.15 s and 0.10 s to about 0.02 s
  each on a 24 MP frame.

One idea did not make it. We fused the noise residual and its block medians
so the residual plane is never held whole. The bits were the same, but peak
memory did not move (the peak is elsewhere in the develop) and the time
change was inside the noise. We dropped it rather than carry the extra code.

## Is the output the same on every machine?

The noise model for a raw without a calibration profile still comes from a
patch-PCA step that uses BLAS. A different BLAS build can change that model's
last bits. So we nudged the model by a known relative error and counted how
many 16-bit output codes moved on a 24 MP frame:

| relative error in the noise model | codes changed |
|---|---|
| one ulp, 1e-13, 1e-11 | 0 |
| 1e-9 | 12 (by 1) |
| 1e-5 | 98,301 (by 1) |

A BLAS reordering is around 1e-15 to 1e-13, well below the first change. The
one case left open is a patch sitting exactly on the PCA's texture threshold.
A version of the PCA with a fixed summation order would close that case, and
it is the next step.

The measurements and how to rerun them are in the venture's
`eval/noise-aware-native-levels-2026-11-19.md`. ShootFlow is MIT-licensed and
runs entirely on your machine.
