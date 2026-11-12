---
title: "A contrast curve that keeps hue: camera profile tone curves, measured"
seo_title: "DNG ProfileToneCurve and hue-preserving RGB tone, measured on 126 DCP profiles"
date: 2026-11-12
tags: [photography, raw, dng, dcp, tone-curve, colour-science, image-processing]
description: "ShootFlow now applies a camera profile's tone curve the way the DNG reference code does. A per-channel curve would turn saturated hues by 3.8 degrees on average; this one turns them by none."
---

ShootFlow, the open-source overnight pipeline for photographers in
`ventures/photo-editing`, develops DNG raw files with its own small developer.
Earlier today it learned to apply a camera profile's colour tables. Tonight it
learned the last piece most profiles carry: the **tone curve**.

## What the tone curve is

A raw file is linear: twice the light, twice the number. Shown as is, it looks
flat and grey. Every raw converter adds contrast, and a DNG or `.dcp` camera
profile can say exactly which curve its maker intended (`ProfileToneCurve`), as a
list of points from (0, 0) to (1, 1) to be joined by a smooth cubic spline.

Of the 161 camera profiles RawTherapee ships, 126 carry one:

- 53 are a straight line (no change);
- 68 share one and the same 8,192-point curve;
- the rest are a handful of variants.

The shared curve takes linear mid-grey (0.18) to 0.388 and is about 2.1 times
steeper there than a straight line: a slight toe that deepens the darkest
shadows, a strong lift through the mid-tones, a soft shoulder in the
highlights.

## The interesting part: applying it without shifting colour

The obvious way to apply a curve is to run red, green and blue through it
separately. That changes colours as well as contrast. Take a saturated orange:
its three channels sit at different heights on the curve, so each is stretched
by a different amount, and the hue drifts.

We measured it. On 20,000 saturated colours, running the shared curve on each
channel separately turns the hue by **3.8 degrees on average, 10 degrees at the
95th percentile and 15.5 degrees at worst**. That is enough to push skin towards
yellow or a sky towards cyan.

The DNG reference code uses a different method, and ShootFlow now does the same.
Only the brightest and darkest channel go through the curve. The middle channel
is then placed between them at the same fraction of the way as before. The
colour gets the curve's contrast, and its hue (in HSV terms) does not move at all:
at most 8e-14 degrees in our test, which is floating-point noise.

## How we checked it

- The spline: the DNG specification asks for a cubic spline, and the reference
  code's is the *natural* one (second derivative zero at both ends). Ours matches
  a second implementation written separately in the tests and scipy's
  `CubicSpline(bc_type="natural")`, to 3e-16 on all 126 real curves.
- All 126 curves load, and every one samples to a table that never goes down.
- The faster numpy engine gives exactly the same output bytes as the pure-Python
  one, on random colours, on every tie between channels, and on a whole real frame.

## On a real photo

On a Canon 5D Mark II raw frame (from rawpy's test files; its own profile's curve
is a straight line, so we used the shared curve from the Canon EOS 6D profile),
the tone curve moves 37% of pixels by more than 5 steps out of 255. The frame is
dark, so its median pixel falls slightly into the toe, while the bright end rises:
the 95th percentile goes from 78 to 100. Developing at half size takes 4.8 seconds
with numpy.

```
shootflow develop IMG_0001.dng --out masters/ --dcp "Canon EOS 6D.dcp"
shootflow develop IMG_0001.dng --out masters/ --no-tone-curve   # tables, plain sRGB curve
```

## What we don't know yet

Whether this brings ShootFlow's render closer to what Lightroom or Adobe Camera Raw
make from the same file and profile. That needs an Adobe render of a known frame,
which we don't have. The full measurements are in
`ventures/photo-editing/eval/tone-curve-2026-11-12.md`.
