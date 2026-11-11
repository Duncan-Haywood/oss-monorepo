---
title: "Decoding a camera's lossless JPEG: the sum that forgets each row"
seo_title: "Lossless JPEG predictor 1 as numpy cumulative sums in Python"
date: 2026-11-11
tags: [photo-editing, shootflow, raw, dng, lossless-jpeg, numpy, performance]
description: "How ShootFlow cut its lossless-JPEG prediction pass from about 4 s to 1.2 s on a real Canon CR2, every sensel still equal to LibRaw."
---

DNG files, and Canon's CR2 files, store the sensor as a *lossless JPEG*: each
sample is written as the difference from a guess. With predictor 1, the one
DNG writers use, the guess is the sample to its left. At the start of a row it
is the sample above, and on the very first row (or after a restart marker) it
is a fixed starting value.

[ShootFlow](../../ventures/photo-editing/README.md), the open-source photo and
video pipeline in this repository, decodes these streams in its own
standard-library Python code. Earlier today the decoder was split into two
passes: first read every Huffman-coded difference, then turn differences into
samples. On a real Canon EOS 5D Mark II CR2 (22 million samples, the rawpy test
file) the second pass took about 4 seconds on this build container.

## Two running sums

"Add the difference to the sample on the left" is a running sum along each
row. The only problem is where each row's sum starts: from the sample above,
not from the end of the previous row. But that start is itself a running sum.
The first column is the first difference of each row added to the first
column of the row before, so it is a running sum *down* the image, restarted
wherever a restart marker begins a row.

So predictor 1 becomes two cumulative sums in numpy: one down the first column
(segmented at restart rows), then one along every row. Predictor 2 ("the
sample above") is the transpose of the same idea: each column is a running sum
down the image, and each fresh row is a running sum along it. Sums run in
64-bit integers and are reduced modulo 2^16 once at the end. That equals
masking after every step only because these predictors only add, which is
also why predictors 3 to 7 (which halve) stay on the one-sample-at-a-time path.

## What it bought

Measured three times, interleaved, on the same container (the full table is in
[eval/ljpeg-numpy-predict-2026-11-11.md](../../ventures/photo-editing/eval/ljpeg-numpy-predict-2026-11-11.md)):

| Canon CR2, 22.0 M samples | pure Python | with numpy |
| --- | --- | --- |
| everything after the Huffman pass | 3.8-4.1 s | 1.1-1.5 s |
| whole decode | 9.5-9.8 s | 6.6-7.3 s |

Most of what is left in the numpy pass is not arithmetic. Getting 22 million
Python integers into an array takes about 0.55 s; the sums take about 0.2 s.
The Huffman reader is now about 85% of decoding, and a bit reader cannot be
vectorised, so the next step down is native code.

## How we know it is the same

numpy stays optional, and the pure path stays the reference. The 345 encoded
test images built to reach every branch of the decoder run again with the
numpy pass forced on, and must decode to the exact samples. Seeded faults
(forgetting the starting value, not restarting the column sum, skipping the
row sum) each broke 39 to 48 of them. On the CR2, the numpy-decoded sensor,
with Canon's vertical slices put back, matches LibRaw's `raw_image` in all
22,032,768 sensels.

One check failed in an instructive way: removing the final `& 0xFFFF` broke
nothing. That is correct. Casting to a 16-bit unsigned type already wraps, so
the mask is documentation, not behaviour.

This is a measured speed-up of ShootFlow's own code on one real file and
synthetic tiles, not a claim about other decoders. ShootFlow is MIT-licensed;
its README says how to run it on your own machine.
