---
title: "Halving one array in a raw develop, and the 12-bit tone table it turned up"
seo_title: "Float32 in a raw develop: 15% less memory, a 12-bit tone table"
date: 2026-11-17
description: "ShootFlow's noise-aware develop holds its bilinear image in float32: 15% less memory, and every changed pixel value is one step of a 4,096-entry tone table."
tags: [photo-editing, raw, demosaic, performance]
---

ShootFlow, the open-source photo pipeline in `ventures/photo-editing`, has a noise-aware demosaic: it blends
an edge-keeping demosaic toward plain averaging wherever the edges it finds are smaller than the sensor's
noise. Earlier today it got 2.2 times faster without changing a byte of output. The note on that change named
one more cut: the plain-averaged (bilinear) image, the largest array the develop holds, was 64-bit floats,
while the edge-keeping image beside it was already 32-bit. Halving it would change output bytes, so it needed
its own check.

## The change

The bilinear image is now stored as 32-bit floats. The blend still does its arithmetic in 64-bit, one band of
rows at a time, and writes each band back into that array. Two places that read the result widen it back to
64-bit first, so the colour matrix and the tone curve run exactly as before.

On the 14 largest public sample raws we have (12 to 36 megapixels: Nikon, Pentax, Sony, Samsung, Leica,
Fujifilm X-Trans and an LG phone DNG), the memory the develop adds fell a median 15% (10-36%). The two Sony
files and the Leica T gained most, about a third: their peak was the moment both full-size images were held
at once, and this is the one that halved. Time did not move (0.93-1.04x), because the blend is bound by its
arithmetic, not by storage.

## Did the picture change?

In 13 of 14 files some output values changed, at most 4 in every 100,000. That alone says little: a 32-bit
float holds about 7 digits, and the output needs fewer than 5. What was odd was the size of the changes. None
moved by 1 code. They moved by 16 to 198 codes out of 65,535.

Every one of the 7,508 changed values turned out to be exactly one entry apart in the develop's tone table.
The develop maps linear light to output through a 4,096-entry lookup table, so a value that sits within a
rounding error of the boundary between two entries can land on either. The 64-bit develop picks one just as
arbitrarily. Neither output is the more correct one, so the change shipped.

## What the check found instead

Each output channel holds at most 4,096 distinct values, about 12 bits of tonal resolution in a 16-bit file,
with neighbouring values up to 200 codes apart in the shadows. You will not see it in an 8-bit JPEG. You may see
it as banding in a 16-bit TIFF whose shadows you push hard in an editor. The fix is to interpolate between
table entries. That changes every develop's output, so it is the next item, checked against ShootFlow's
reference path and LibRaw.

The numbers, method and commands to reproduce are in
`ventures/photo-editing/eval/noise-aware-float32-2026-11-17.md`.
