---
title: "The Leica told us how its lens bends, and its own preview confirms we listened"
seo_title: "DNG WarpRectilinear lens correction, checked against the camera"
date: 2026-11-12
tags: [photo-editing, ventures, raw, dng]
description: "A Leica T DNG stores its lens correction as a WarpRectilinear opcode. ShootFlow now applies it, matching the camera's own preview to 0.18 px."
---

[ShootFlow](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/photo-editing) develops raw photos into 16-bit masters on your own machine. This morning it learned to read the lens shading map that phones write into their DNG files. The same sample set held a Leica T DNG with a different instruction: a `WarpRectilinear` opcode in `OpcodeList3`, flagged "required". ShootFlow's report said "not applied". So did every render of that frame.

## What the camera wrote down

`WarpRectilinear` is a lens model stored inside the file. For every pixel of the corrected picture it says where to look in the uncorrected one. The distance from the centre gets multiplied by a polynomial, f(r) = kr0 + kr1·r² + kr2·r⁴ + kr3·r⁶, with r = 1 at the corner. On this Leica, f runs from 0.97 at the centre to 1.000 at the corners. So the corners stay put, and the middle of the picture reads from 3% closer to the centre. That means the lens has pincushion distortion, and the correction pulls the middle outward to straighten it.

The file holds three sets of terms, one per colour. They differ a little: at the corner, blue reads from 1.4 pixels nearer the centre than green. That is the lens's lateral colour fringing, corrected by the same opcode.

## Applying it

ShootFlow now runs the warp after demosaicing, on the linear image and before colour and tone. A warp resamples pixels, and resampling should happen in linear light. Each output pixel takes its value from the source point the formula names, interpolated between the four nearest pixels. The pure-Python engine and the numpy engine produce identical bytes. A full-size 16 MP develop goes from 2.2 to 8 seconds on the numpy engine. `--no-opcodes` turns the warp off.

On synthetic images the check is exact. Bilinear interpolation reproduces a linear ramp perfectly, so every warped pixel must equal the ramp at the formula's source point. That holds to nine decimal places for magnification, barrel, pincushion, an off-centre axis and the tangential terms. We also read [darktable](https://github.com/darktable-org/darktable)'s lens module, which applies the same opcode. It uses the same polynomial, the same direction (output to source) and the same normalisation. The only difference is a pixel-centre convention, worth 0.015 px on this lens.

## Did we bend it the way the camera did?

The file answers that itself. Inside the DNG is the camera's own 720 × 480 JPEG preview, which the camera rendered with its correction applied. We developed the frame with the warp on and off and shrank each render to the preview's size. Then we block-matched 444 textured patches of the preview against each render. If our warp matches the camera's, the patches line up; if not, they sit off by however far the warp moves them.

| distance from centre (1 = corner) | patches | offset, warp on (preview px) | offset, warp off | the formula's prediction for "off" |
|---|---|---|---|---|
| 0.1–0.2 | 28 | 0.49 | 2.02 | 1.97 |
| 0.3–0.4 | 67 | 0.37 | 3.84 | 3.97 |
| 0.5–0.6 | 67 | 0.32 | 4.85 | 5.04 |
| 0.7–0.8 | 61 | 0.40 | 4.19 | 4.51 |
| 0.8–0.9 | 23 | 0.69 | 3.40 | 3.57 |

(Medians. The full table is in [the eval note](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/warp-rectilinear-2026-11-12.md).)

Without the warp, the patches sit up to 5 preview pixels off, or about 34 pixels at full size. The offset rises and falls with the radius as the formula predicts, within 0.1 to 0.3 px in every band. With the warp, the radial offset drops to a median 0.18 px. Sideways (tangential) offsets, which no lens model touches, measure 0.34 px, so 0.18 px is within the matcher's noise. The camera's render and ours have the same geometry, to the precision a 720-pixel preview allows.

## What this doesn't show

The colour planes' differences, 0.2 to 1.4 full-size pixels, are too small to see in a 720-pixel preview. Testing the lateral-colour part needs a frame with sharp edges near the corners. We also have no Adobe render of this frame, so the choices the specification leaves open (the sampling kernel, where a pixel's centre sits) haven't been compared with Adobe's pixel for pixel. Other opcodes, such as FixVignetteRadial and MapPolynomial, are still listed in the report but not applied.

The check is a script anyone can run on a DNG that has both a preview and a warp: `tools/warp_preview_check.py`. ShootFlow is MIT-licensed and runs on your own machine. Results are estimates from the file's own metadata, with no warranty.
