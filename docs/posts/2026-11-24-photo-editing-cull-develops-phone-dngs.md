---
title: "Phone DNGs often carry no preview. The browser culler now develops one from the sensor data"
seo_title: "View phone DNG raw files with no preview in the browser"
date: 2026-11-24
tags: [photo-editing, raw, dng, culling, phone]
description: "ShootFlow Cull now develops DNGs with no embedded JPEG, from Nexus, Pixel and HDR+ bursts, in the browser. Sensels match our raw reader on 32 of 32 files."
---

[ShootFlow Cull](https://marisstella.app/photo-editing/cull.html) is a free
browser page for rating a card of raw files. It is fast because it never
develops a raw. It shows the JPEG the camera tucked inside each file, reading
about 2% of the bytes.

That trick fails on a whole class of files. Many phones write DNGs with no JPEG
inside at all. In our first check, the one phone DNG in the public sample set
(a Nexus 5X) came up as "no embedded JPEG preview found". Google's public HDR+
burst set shows how common this is. We drew 26 frames from it (Nexus 5, 6, 6P,
5X, Pixel and Pixel XL), and none of them carries a preview.

## What the page does now

When a DNG has no JPEG, the page reads the sensor data itself, in a background
worker so the grid keeps scrolling:

- **Decoding.** It reads both ways phones store the mosaic: plain 16-bit strips,
  and tiles of lossless JPEG (the 1990s predictive coding DNG uses, not the lossy
  kind).
- **One pixel per 2 × 2 block.** Each red, green, green, blue quad becomes one
  pixel. That gives a picture half the sensor's width (2,024 × 1,518 for a Pixel)
  with no demosaicing guesswork.
- **The phone's own numbers.** It applies the black and white levels, the crop,
  the white balance the phone chose, and the colour matrix in the file. It also
  applies the lens-shading map: phones darken and tint their corners, and the
  DNG carries the correction.
- **Brightening.** It lifts the image by at most two stops so the bright end of
  the frame sits near white. Phone raws are often shot dark to protect the
  highlights.

## How we checked it

- **The numbers it reads.** On 32 public DNGs (the 26 HDR+ frames plus the 6
  camera and phone DNGs in the metadata-extractor sample set), every sensor
  value the browser reads equals what ShootFlow's Python raw reader reads. That
  reader is the one checked against LibRaw in earlier runs. It held on all 32
  files, 8 to 16 million values each.
- **Colour.** We shrank each preview and ShootFlow's own half-size development
  of the same file to 256 px, matched exposure, and compared them in CIELAB. The
  median file is 0.41 ΔE away, below what people notice side by side. The worst
  is 3.3, a Leica whose lens-distortion correction the page doesn't run. Its
  pixels sit in slightly different places; the colours aren't wrong.
- **Two bugs the measurement caught.** Before the checks, three of 32 previews
  came out magenta. The colour-filter pattern was being counted from the wrong
  corner after a crop, and white balance was pushing blown highlights pink. The
  lens-shading map moved the Nexus 5X from 6.6 ΔE to 0.36. Unit tests now pin
  all three.
- **Speed.** In Chromium the 26 phone frames (529 MB) loaded in 10.8 seconds,
  all 26 with previews.

## What it isn't

It is a preview for picking keepers, not an edit. There is no sharpening, no
tone curve and no lens distortion correction, and half resolution is the
ceiling. Files that do carry a JPEG still use it, so nothing changes for camera
raws. Not yet covered: newer DNGs compressed with JPEG XL, and Safari and
Firefox, which we haven't tested.

The code is MIT: `site/rawmosaic.mjs` in
[ventures/photo-editing](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/photo-editing).
The full measurement is `eval/cull-raw-data-previews-2026-11-24.md`.
