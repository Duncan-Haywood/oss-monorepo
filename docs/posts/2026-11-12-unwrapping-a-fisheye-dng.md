---
title: "Unwrapping a fisheye DNG: what the WarpFisheye opcode asks a raw reader to do"
seo_title: "DNG WarpFisheye opcode: atan(r) fisheye to rectilinear, explained"
date: 2026-11-12
tags: [photography, raw, dng, lens-correction, image-processing]
description: "ShootFlow now runs the DNG WarpFisheye opcode. What its four terms mean, why an ideal fisheye reads radius atan(r), and what we could and could not check."
---

ShootFlow, the open-source overnight pipeline for photographers in
`ventures/photo-editing`, develops DNG raw files with its own Python developer.
Over the last day it learned to run the corrections a DNG carries as "opcodes":
the lens-shading maps phones write, the distortion correction cameras write, and
dead-sensel lists. Today it runs one more, `WarpFisheye`. Before this, a DNG that
carried it got a line in the report ("1 x WarpFisheye (required) not applied")
and the picture stayed curved.

## What does the opcode say?

A fisheye lens does not draw the world the way a pinhole does. A pinhole puts
a ray coming in at angle θ off the axis at a distance proportional to tan θ from
the centre, so straight lines stay straight, but the edges stretch towards
infinity as θ nears 90°. A typical fisheye puts that ray at a distance
proportional to θ itself (the "equidistant" projection), which is how it fits
180° onto a sensor, at the cost of bending every line that does not pass
through the centre.

`WarpFisheye` (opcode 2 in the DNG specification's `OpcodeList3`, which runs
after demosaic) converts the second picture into the first. For each pixel of
the corrected image it says where to read from in the fisheye one:

* measure the pixel's distance from the optical centre, `r`, scaled so the
  farthest corner is at `r = 1`;
* take `t = atan(r)`, the angle a pinhole would give that point;
* the source radius is `kr0 t + kr1 t³ + kr2 t⁵ + kr3 t⁷`, along the same ray.

The four terms are per colour plane, so the opcode can correct lateral colour
too. With `kr0 = 1` and the others zero it is the textbook unwrap: a pixel at
pinhole radius `r` reads from fisheye radius `atan(r)`. The corner of the
output reads from π/4 ≈ 0.785 of the way out along the diagonal, so the
unwrap pulls the fisheye's rim inward and crops it, as any rectilinear view of a
fisheye frame must.

## How it is checked

There is no reference to compare with here, so the checks are closed forms:

* With `kr0 = 1`, the source point of four pixels on a 4000 × 3000 frame lies
  at radius `atan(r)` on the pixel's own ray, to 12 decimal places, and the
  corner reads from exactly π/4 of the corner distance.
* On an odd-sized frame one pixel sits exactly on the centre, where `r = 0` and
  the formula divides by zero; the limit is `kr0`, and that pixel reads itself.
* Bilinear sampling is exact on a function linear in x, so on a horizontal ramp
  every in-frame output pixel must equal the ramp at the source point. It does,
  to 9 places, for four sets of terms, one of them off-centre.
* The numpy engine and the pure-Python one give the same bytes, full and half
  size. That took one choice: numpy's vectorised `arctan` may differ from the
  C library's `atan` in the last bit, so the numpy path calls `math.atan` once per
  pixel and shares it across the three colour planes. A 3 MP image warps in
  0.95 s, against 0.70 s for the rectilinear warp.

## What is not checked

The formula is the specification's as we know it. Neither the DNG specification
PDF nor Adobe's SDK source could be fetched from the session that wrote this
code, and no open-source raw reader we could read runs this opcode: darktable
runs GainMap, WarpRectilinear and FixVignetteRadial, and ExifTool and PiDNG
name WarpFisheye without its parameters. We have also not found a DNG that
carries it; Adobe's converter writes one for a fisheye lens with a lens
profile. So the code is right if the formula is, and the next step is a
converter-written fisheye DNG, or a reader with the SDK, to check that.

The details, every test and the choices are in
`ventures/photo-editing/eval/warp-fisheye-2026-11-12.md`.
