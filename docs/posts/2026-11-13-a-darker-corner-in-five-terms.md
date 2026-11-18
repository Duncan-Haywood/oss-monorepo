---
title: "A darker corner in five terms: lensfun's vignetting as a DNG opcode"
seo_title: "Lens vignetting correction for raw files from lensfun, free"
date: 2026-11-13
tags: [photo-editing, raw, lensfun, dng, vignetting]
description: "ShootFlow now brightens dark lens corners from lensfun's calibrations, fitted to a DNG opcode: median error 0.0036% over 54,108 cases."
---

Most lenses leave the corners of a photo darker than the middle. That's vignetting.
Cameras that write DNG files sometimes store a fix for it inside the file. A Canon CR2,
and the DNGs most converters write, carry no fix at all. Lensfun's open database has
volunteer calibrations for this fall-off: 29,817 of them, across 717 lenses.

[ShootFlow](https://marisstella.app/photo-editing/), our free raw developer, already
corrected distortion and colour fringes from lensfun. It now corrects vignetting too,
with `shootflow develop --lens-db DIR`.

## Two formulas that don't quite match

Lensfun models the darkening as `c = 1 + k1 r² + k2 r⁴ + k3 r⁶` and divides each pixel
by `c`. We took the scale of `r` and the rules for interpolating between calibrations
from lensfun's source code (`mod-color.cpp` and `lens.cpp`), not from memory.
Calibrations are taken at particular focal lengths, f-numbers and focus distances.
Lensfun blends the nearest ones for your shot by inverse distance weighting, and
refuses when none is close enough.

ShootFlow already runs the DNG standard's `FixVignetteRadial` opcode. Its gain is a
polynomial, `1 + k0 r² + … + k4 r¹⁰`. Lensfun's `1 / c` is not a polynomial, so the
opcode can only approximate it. We fit the five terms by least squares on the relative
error, weighting each radius by how many pixels sit at it. Where that leaves more than
0.1% error, ten rounds of Lawson reweighting move the fit toward the smallest worst-case
error. On the hardest cases that cut the error about 2.5 times.

## How close it gets

We ran every calibration in lensfun's database through the fit, plus a midpoint between
each pair of apertures to test the interpolation: 54,108 cases on a 6000-pixel frame.

| Fitted gain vs lensfun's | |
|---|---|
| median error | 0.0036% |
| 90th percentile | 0.098% |
| 99th percentile | 1.1% |
| refused | 396 cases (0.7%) |

A 1% error in brightness is 0.014 of a stop, well below what you can see. The refusals
come in two kinds. In 183 cases the calibration's `c` drops to zero or below inside the
frame, so lensfun would brighten by an infinite or negative amount. The other 213 have
no five-term fit within 10%. Every one of those, compact-camera profiles among them,
gets a note in the develop report instead of a wrong correction.

## Why bother

Lensfun's own gain at the far corner is a median of +0.46 stops. It is over half a stop
in 47% of cases and over a full stop in 18%. That's how much darker those corners stay
if nothing corrects them.

## What isn't checked yet

These checks prove that we copied lensfun's formula correctly. They don't prove that the
formula fits your copy of the lens. That would take a real photo of an evenly lit wall
or sky, shot wide open, to see whether the corners come out level. We also haven't run
the formula through lensfun's compiled library the way we did for distortion. Both are
next. The details, the tests and nine seeded faults that the tests catch are in
`ventures/photo-editing/eval/lensfun-vignetting-2026-11-13.md`.

ShootFlow is MIT licensed and runs on your own machine. Lensfun's database is CC BY-SA
3.0 and is read at run time, not bundled.
