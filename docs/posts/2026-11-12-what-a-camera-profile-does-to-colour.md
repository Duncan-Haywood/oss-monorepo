---
title: "What a camera profile does to colour: 161 DCP profiles measured"
seo_title: "DCP camera profile HueSatMap and LookTable, measured on 161 profiles"
date: 2026-11-12
tags: [photography, raw, dng, dcp, colour-science, image-processing]
description: "ShootFlow now applies DNG/DCP hue/saturation maps and look tables. Across 161 real profiles, the median turns saturated hues 10 degrees and adds 27% saturation."
---

ShootFlow, the open-source overnight pipeline for photographers in
`ventures/photo-editing`, develops DNG raw files with a small Python developer.
This morning it learned to blend a DNG's two colour matrices for the light a
photo was taken in. This afternoon it learned the other half of a camera
profile: the **hue/saturation map** and the **look table**. It can also now
read `.dcp` camera profiles, the files Adobe DNG Converter installs and that
RawTherapee and dcamprof write.

## What is in a camera profile besides the matrices?

A 3x3 matrix can only do so much. It maps the camera's red, green and blue onto
standard colour, but real sensors are not linear transforms of human vision.
A matrix that gets skin right can get deep blues or foliage a little wrong. So a
profile maker measures the leftovers and stores a correction grid:

- the **hue/saturation map** splits colour space into cells (90 hues x 30
  saturations is common) and stores, for each cell, a hue shift in degrees, a
  saturation multiplier and a value multiplier;
- the **look table** has the same structure and is applied after the
  exposure, often with a brightness axis too (90 x 30 x 30). It is where a
  "look" lives;
- both are applied in linear ProPhoto RGB, interpolating between cells, with
  hue wrapping from 359 back to 0 degrees.

When a profile has two maps, one for tungsten and one for daylight, they blend
for the as-shot light with the same weight as the matrices.

## What do real profiles do?

RawTherapee ships 161 camera profiles. We read every one of them with the new
code (the tool is `tools/dcp_check.py`; the profiles are fetched at run time
from RawTherapee's repository, not copied in):

| | |
|---|---|
| profiles read | 161 of 161 |
| with a 90-hue map (90x30, one 90x25) | 127 (most with a second map for the other light) |
| with a small 6x6x3 map | 34 |
| with a look table | 72 |
| with a tone curve | 126 |

On saturated colours (ProPhoto saturation 0.3-0.9), the **median profile turns
hue by 10 degrees on average and multiplies saturation by 1.27**. The 6x6x3
profiles are much gentler: 1 degree and x1.015. Greys come through exactly
grey in every profile, which is what you want from a profile and a good check
on the reader.

Two profiles stood out:

- One profile's map has hue shifts of -179 and +176 degrees in neighbouring
  cells. Interpolating linearly between those, as the DNG specification and
  Adobe's SDK do, sweeps through every hue in between, so one test colour moved
  171 degrees. That looks like an angle-wrap fault in how the profile was made.
  If one of your colours renders strangely with a downloaded DCP, check for this.
- Another profile's maps are all identity: zero shift and x1 scales. The
  developer spots this and skips them.

## On a real raw file

We developed a Canon 5D Mark II raw frame at half size (2817x1876) with that
camera's RawTherapee profile:

- switching from the file's own Adobe matrix to the profile's ForwardMatrix
  moved 43% of pixels by more than 5 8-bit steps;
- adding the hue/saturation maps moved 36% by more than 5 steps;
- the pure-Python and numpy engines gave the same bytes for the whole frame.
  numpy took 3.8 s with the maps and 1.3 s without; pure Python took 35 s.

These numbers say how much a profile changes a picture. They do not say the
result is more accurate. That needs a photographed colour chart, which is
still on the list.

## How it was checked

The table arithmetic is tested against a second implementation written from
Python's `colorsys` module, with no shared code. On four table shapes and 3,000
random colours each, they agree to better than 1e-9. Renders with a known
+20 degree hue rotation match the plain render rotated by hand. A `.dcp` file
gives exactly the same bytes as the same tags embedded in the DNG. The details
are in `eval/dcp-tables-2026-11-12.md`.

## Try it

```
shootflow develop IMG_0001.dng --out masters/ --dcp "Canon EOS 5D Mark II.dcp"
```

## What is next

The profile's **tone curve** is the missing piece. 126 of the 161 profiles
carry one, and Adobe applies it with a hue-preserving curve operator. Without
it, a DCP render has the profile's colours but is flatter than Lightroom's.
That is the next milestone.
