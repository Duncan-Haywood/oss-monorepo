---
title: "A pure-Python DNG developer, checked pixel by pixel against LibRaw"
seo_title: "Develop DNG raw files in pure Python, checked against LibRaw"
date: 2026-11-10
tags: [photography, raw, dng, libraw, image-processing]
description: "A stdlib-only DNG developer for ShootFlow matches LibRaw within one 8-bit step on a real Nikon and Canon file, after one fix to clamping order."
---

ShootFlow, the open-source overnight pipeline for photographers in
`ventures/photo-editing`, could score RAW photos from the JPEG preview the camera
embeds, but it could not develop them. A RAW still stopped the pipeline before the
grade. It now has `shootflow develop FILE.dng --out DIR`, which reads the sensor
data and writes a neutral 16-bit TIFF master, using only the Python standard
library.

It is the plain rendering a dcraw user would know. It applies the black and white
levels, the as-shot white balance and the camera's colour matrix through sRGB
primaries, demosaics bilinearly and applies the sRGB curve. It decodes lossless-JPEG
sensor tiles itself. It does not reconstruct highlights or reduce noise, and it
does not try to match Lightroom.

## How do you check a RAW developer with no real DNG to hand?

The usual sample sites answer 403 from our build sandbox. rawpy's test folder on
GitHub does have real camera files: a Nikon NEF (a NASA photo from the ISS) and a
Canon 5D Mark II CR2. They are not DNGs. So a small tool
(`tools/libraw_differential.py`) has LibRaw read the sensor values, CFA pattern,
per-channel black, white level, camera white balance and Adobe's colour matrix,
and writes them into a DNG. ShootFlow develops that DNG. LibRaw develops the
original with the same steps (bilinear, camera white balance, clip, no
auto-brightening, sRGB), and the two renders are compared pixel by pixel.

## What the comparison found

The first Canon run had 10% of pixels more than one 8-bit step apart. All of them
were in the deep shadows. The Canon's black level is about 1026, so shadow noise
dips below black. We let those negative values average through the demosaic and
clamped at the end. LibRaw clamps each sensel at zero first. Averaging clipped
noise lifts the shadows slightly, and on the steep part of the sRGB curve that
shows. Clamping per sensel before demosaicing, at zero and at the white-balanced
clip level, made every pixel agree within one step. The same change removed a
handful of highlight-edge pixels on the Nikon that had been up to 75 steps out.

After the fix, the worst pixel on either camera, at full or half size, is at most 0.6 of
a step from LibRaw. The mean difference is about a tenth of a step.

## What is still unproven

The DNGs in this check were written by our own tool, so our reading of a DNG from a
camera or from Adobe's converter is tested only on synthetic files. ffmpeg's
lossless-JPEG encoder is used as an independent check of the tile decoder. Speed is
the cost of pure Python: about 37 seconds for a 12 MP frame at full size, against
LibRaw's third of a second. That is fine for an overnight job. The next slice is to
have the nightly pipeline call it for DNG stills.

Code, tests and every number: `ventures/photo-editing/README.md`, "Develop DNG raw
files", and `ventures/photo-editing/eval/raw-develop-libraw-2026-11-10.md`.
