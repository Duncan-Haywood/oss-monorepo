---
title: "Why a DNG has two colour matrices, and what using only one costs an indoor photo"
seo_title: "DNG ColorMatrix1 vs ColorMatrix2: blending by colour temperature"
date: 2026-11-12
tags: [photography, raw, dng, colour-science, image-processing]
description: "ShootFlow blends both DNG camera matrices for the as-shot light. On a real Canon 350D profile at 3584 K, the one-matrix method differs by up to 35 8-bit steps."
---

ShootFlow, the open-source overnight pipeline for photographers in
`ventures/photo-editing`, develops DNG raw files into 16-bit masters with a
stdlib-only Python developer. Until today it took colour the way dcraw and LibRaw
do: it used the camera matrix measured in daylight and white-balanced in the
camera's own colour space. That is the right answer for a photo taken in daylight.
For one taken under a tungsten lamp, it is not the answer the DNG specification gives.

## Why does a DNG carry two matrices?

A camera's red, green and blue filters do not map onto human colour vision exactly,
so how a camera responds to a colour depends a little on the light. Adobe's DNG
format allows for that: a profile is measured twice, usually under Standard
Illuminant A (a tungsten bulb, about 2856 K) and under D65 (daylight), and the file
stores both matrices. A reader is meant to find the white the photo was taken
under, work out its colour temperature, and blend the two matrices in inverse
temperature (mired) for that light.

There is a chicken-and-egg problem in that. The camera records the white as raw
numbers (`AsShotNeutral`), and turning those into a chromaticity needs a matrix. But
which matrix to use depends on the white. The specification's answer is to iterate:
guess a white, blend for its temperature, map the neutral back, and repeat until
the white stops moving.

## What changed

`shootflow develop` now follows that model by default
(`src/shootflow/dng_colour.py`). It reads `ColorMatrix1/2`, `CameraCalibration1/2`
(only when its signature matches the profile's), `AnalogBalance` and, when present,
`ForwardMatrix1/2`, which maps white-balanced camera values straight to XYZ D50.
It finds the white from `AsShotNeutral`, or takes it from `AsShotWhiteXY` when
that is all the file has, and goes from XYZ D50 to sRGB through a Bradford
adaptation. The JSON report now says which tags were blended at what temperature,
for example `"ColorMatrix1+2 at 3584 K"`. `--colour dcraw` keeps the old method,
and the LibRaw comparison from 2026-11-10 now runs with it.

## How was it checked?

Three ways, written up in `eval/dng-colour-2026-11-12.md`:

- **Scenes with a known answer.** The tests build DNGs from a made-up camera
  whose response under tungsten differs from its response in daylight. Under
  tungsten the new model gives the patches back within 0.0004 in linear light.
  The one-matrix method misses them by 0.036.
- **An independent implementation.** colour-hdri, from the colour-science
  project, implements the same specification with its own code. Over 2,000
  random profiles and whites from 2,000 to 10,000 K, the temperatures agree to
  rounding and the camera-to-XYZ matrices agree to about 1e-13. In two cases the
  profile had more than one self-consistent white, and the two loops, which start
  from different guesses, settled on different ones.
- **A real camera's profile.** exiftool's test suite includes a DNG that Adobe's
  converter wrote from a Canon EOS 350D. The image data has been stripped, but the
  colour tags are intact. Its as-shot white is x 0.4014, y 0.3905, about 3584 K,
  so an indoor shot, and the blend is 64% the tungsten matrix. colour-hdri finds
  the same white and matrix. On 64 colour patches at that white, the one-matrix
  method lands up to 35 8-bit sRGB steps from the DNG model, 9 on average.

That last number shows how far apart the two methods are on a real profile. It
does not show which one is closer to the real scene. Answering that needs a
colour chart shot under tungsten with known patch values, and we don't have one yet.

## Three bugs the comparison caught

The independent check paid for itself before the numbers above were final:

1. The plain iteration crawls when the two matrices differ a lot (up to 226
   steps). A first version capped it at 30 steps and left the white 0.0015 off.
   The fix iterates on the blend weight and switches to bisection when it stalls.
2. A bisection-only version sometimes found a *different* self-consistent white
   from the one the specification's loop reaches. Iterating first fixed that.
3. A guard that clamped Bradford's cone ratios to between 0.1 and 10 changed
   the matrix for candle-warm whites near 2,000 K. The specification has no such
   clamp, so it is gone.

## What is still open

The next steps are a DNG written by a camera or by Adobe that carries
`ForwardMatrix` (the 350D file has none), DNG 1.6's third calibration illuminant,
the profile hue/saturation maps, and that tungsten-lit chart. ShootFlow is MIT
licensed. The developer and the check tool are in `ventures/photo-editing`.

*This post describes free open-source software and is not professional advice.*
