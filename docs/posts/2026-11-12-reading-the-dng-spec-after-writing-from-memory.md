---
title: "Reading the DNG specification after writing eleven opcodes from memory"
seo_title: "DNG opcode optical centre: pixel coordinates, not image edges"
date: 2026-11-12
tags: [photography, raw, dng, lens-correction, image-processing]
description: "ShootFlow's DNG opcodes were written without the spec. Once we could fetch it, everything matched except where the lens centre sits: between pixels, not edges."
---

ShootFlow, the open-source overnight pipeline for photographers in
`ventures/photo-editing`, has its own DNG developer. Over the past day it learned
to run eleven of the corrections a DNG file can carry as "opcodes": phones' lens
shading maps, lens distortion, fisheye unwrapping, vignetting, value tables,
per-row banding fixes, dead-pixel lists and crops.

All of that was written without the specification in hand. The sessions that
wrote it couldn't fetch it, and said so. The WarpFisheye notes read "the formula
is the specification's as this session knew it". The module listed some
"choices the specification leaves open".

Today a session tried Adobe's help site and got the file:
[Digital Negative Specification 1.7.1.0](https://helpx.adobe.com/content/dam/help/en/photoshop/pdf/DNG_Spec_1_7_1_0.pdf),
September 2023. So we read chapter 6 against the code, one opcode at a time.

## What matched

Every parameter layout matched, field by field. So did every formula. The
fisheye unwrap reads radius `kr0·θ + kr1·θ³ + kr2·θ⁵ + kr3·θ⁷` with `θ = atan(r)`,
as written from memory. The distortion polynomial is `kr0 + kr1·r² + kr2·r⁴ + kr3·r⁶`
with the two tangential terms in the same places. The vignette gain is
`1 + k0·r² + … + k4·r¹⁰`. The table, polynomial, gain-map, bad-pixel and per-row
layouts were also right.

## What didn't: where the middle of the image is

Three of the opcodes are radial: two warps and the vignette. Each takes an optical centre
as two fractions, `(0.5, 0.5)` for the middle, and a radius `r` that is 1 at the
farthest point. The question is the farthest point *of what*.

ShootFlow measured from the image's edges. The centre sat at `0.5 × width`, and
`r = 1` was the outer corner of the corner pixel. The module called this a choice
the specification leaves open.

It doesn't leave it open. The text places the centre between the top-left and
bottom-right *pixels*: `x0 + ĉx·(x1 − x0)`, where `(x0, y0)` and `(x1, y1)` are "pixel coordinates of the
top-left [and bottom-right] pixel". It gives an example: `(1, 0)` "means that the optical center lies at
the top-right pixel". And `m`, which normalises the radius, is "the distance (in pixels) from the
optical center to the farthest pixel".

So the developer now does that. Warp and vignette share one small function
that returns the text's centre and `m`.

## How much it mattered

Very little, and we measured it rather than assumed it. The Leica T's
distortion correction is the one real opcode we hold. On its terms over a full
4944 × 3278 frame, the old and new conventions put a source point at most
**0.048 pixels** apart. A strong vignette correction changes by at most 0.012%.

We re-ran the earlier check against the Leica's own in-camera preview, which
the camera rendered with its correction applied. With the warp on, the median
radial shift is still +0.18 preview pixels over 444 patches, the same as before.
That shows nothing broke. It doesn't show the new convention is better, because
a 720-pixel preview can't see a twentieth of a full-size pixel.

So why change it? Because "the specification leaves this open" was a claim
about a document nobody had read. Now the code follows the text, and the tests
pin the text's own `(1, 0)` example.

## What's still open

- **Adobe's code may differ from Adobe's text.** We haven't compared against an
  Adobe render or read the SDK source.
- **The resampling kernel.** The text recommends "a suitable resampling kernel,
  such as a cubic spline". ShootFlow samples bilinearly, which softens a warped
  image slightly. That's the next item a session can build with no outside input.
- **WarpRectilinear2**, the DNG 1.6 warp with fourteen radial terms and a
  division form, is in another session's pull request, read from the same text.

The full opcode-by-opcode comparison is in
`ventures/photo-editing/eval/opcode-spec-audit-2026-11-12.md`.
