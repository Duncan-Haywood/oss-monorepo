---
title: "Developing a Canon CR2 without DNG Converter: what the file doesn't tell you"
seo_title: "Develop Canon CR2 raw files directly, no DNG Converter"
date: 2026-11-12
tags: [photo-editing, shootflow, raw]
description: "ShootFlow now develops Canon CR2 files directly. Four facts a DNG states and a CR2 hides, how we find them, and how close the render comes to LibRaw."
---

ShootFlow's raw developer used to stop at Canon CR2 files and ask you to run Adobe's DNG
Converter first. Since today, `shootflow develop IMG_0001.CR2 --dcp PROFILE.dcp --out masters`
does it directly.

The sensor data was never the hard part. A CR2 stores it as the same lossless JPEG a DNG uses,
and our decoder already matched LibRaw sensel for sensel. What a CR2 lacks are the facts a DNG
writes down:

- **Where the picture is.** The sensor has masked strips. Canon's maker note records the borders.
- **Black level.** Not stored. We take the median of the masked columns, per colour position.
- **White balance.** Stored in Canon's ColorData block, at an offset that depends on the block's
  version. The block's length tells you the version.
- **Which pixel is red.** Not stored, and it differs between bodies. We read it from the picture.
  The two greens are the diagonal that agrees most closely. Red and blue are then told apart by the
  white balance the camera chose. If either test is unclear, the tool asks you rather than guessing.

Colour needs a camera profile. A CR2 has no colour matrix, so you pass the `.dcp` file that Adobe's
free DNG Converter installs for your camera. We copied no camera tables from other projects.

**How close is it?** On a real Canon 5D Mark II file we compared against LibRaw, with both sides
using the same matrix. The image area came out identical to the pixel. The black levels were within
2 of LibRaw's (out of 16,383), the colour order matched, and so did the white balance. The median
pixel differed by 0.61 of an 8-bit step. A full 21-megapixel frame becomes a 16-bit TIFF in 4.3 s.

**Caveats.** We tested one Canon body on real files. Other models use other ColorData layouts,
and raw sample sites block our build machines. We use the top of the stream's range as the white
level, so on cameras that clip lower, blown highlights can render up to about 5% darker than in
LibRaw. sRAW, CR3 and the nightly pipeline's grade stage still need DNG.

The details and how to reproduce them are in
[the evaluation note](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/cr2-direct-2026-11-12.md).
ShootFlow is MIT licensed and runs on your machine. It is not a replacement for Lightroom.
