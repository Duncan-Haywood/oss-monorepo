---
title: "Every current Lumix raw file now develops without a DNG converter"
seo_title: "Panasonic RW2 RawFormat 8 (GH6, GH7, S5 II, S9) read in open source"
date: 2026-11-15
tags: [photography, raw, panasonic, lumix, rw2, huffman, libraw, open-source, photo-editing]
description: "ShootFlow now reads RawFormat 8, the RW2 layout of every Lumix since 2022. On ten real files from six bodies, all 464.6 million sensor values equal LibRaw's."
---

ShootFlow is the open-source photo workflow in this repository. This morning it could read the raw files of 16 Panasonic Lumix bodies, from the 2009 GF1 to the 2020 S5 ([this morning's post](2026-11-15-panasonic-lumix-rw2-newer-formats.md)). It could not read any Lumix announced since 2022: the GH6, GH7, G9 II, S5 II, S1 II and S9. Those bodies write a newer layout, RawFormat 8. Anyone shooting on a current Lumix had to put each card through Adobe's DNG Converter before the overnight pipeline would develop a frame.

That gap is closed now. `shootflow develop P1000001.RW2 --dcp PROFILE.dcp`, and the pipeline's grade stage, read RawFormat 8 directly.

## What changed in the format

Every earlier RW2 layout packs its values into fixed 16-byte lines. RawFormat 8 compresses them properly instead:

- **Tiles.** The frame is cut into two or three vertical strips, and each strip is its own bit stream. A camera, or a decoder, can work on the strips in parallel.
- **2x2 blocks.** Each strip is read two rows at a time, one Bayer block (red, two greens, blue) after another. Every value is stored as a step from the same colour in the block to its left.
- **A Huffman table in the file.** Each step is a short code that says how many bits follow, then those bits. It is the same idea as lossless JPEG, and the code table is stored in the file itself (tag 0x40), so each body can use its own.

LibRaw, the open raw library most photo software builds on, has read this format since its 0.22 release. We read LibRaw's decoder to learn the layout. Then we wrote our own, a C version and a pure-Python one that gives the same values, without copying any code. The details are in the [measurement file](../../ventures/photo-editing/eval/panasonic-rw2-format8-2026-11-15.md).

## The check

We took ten public-domain sample files from [raw.pixls.us](https://raw.pixls.us/), covering all six bodies. They include 12-, 14- and 16-bit files, two- and three-strip layouts, and the high-resolution modes that merge several exposures into one frame: 100 MP on the GH6, 96 MP on the S1 II and S9. We compared every file with LibRaw 0.22:

| | result |
|---|---|
| sensor values compared | 464,600,640 |
| values that differ | 0 |
| as-shot white balance, black level, colour layout, in-camera crop | equal on all ten |
| read time with the optional C decoder | 0.5-0.6 s (24 MP), 1.6-1.9 s (96-100 MP) |
| pure-Python reference | same values, 12-14 s for 24 MP |

Both decoders matched on their first full run. We had checked the Python version on the first 16 rows of every strip first, which is why the full run held no surprises.

## The one number we measured before copying

On the 12- and 14-bit bodies, LibRaw puts the white point (the value treated as fully blown) 16 or 64 levels under the clip. Our first version used the clip itself. We did not just adopt LibRaw's number. We counted the sensor values near the top of each frame first:

| file | at the clip | just under it |
|---|---|---|
| S1 II, 96 MP high-resolution mode | 784,307 at 16383 | 474,477 at 16381-16382 |
| S1 II, 24 MP | 235,149 | about 100 per level |
| GH6, 100 MP (16-bit) | 14,452 at 65535 | 44,047 at 65532-65534 |

When the camera merges exposures into the 96 MP frame, almost half a million blown values end up one or two levels under the clip. With the clip as the white point, those pixels count as nearly saturated rather than saturated, and blown highlights come out tinted. So 12- and 14-bit files now use LibRaw's margin. The 16-bit files keep 65535: there the values just under the clip are 0.04% of the frame and under a thousandth of a stop from white.

## What it doesn't do yet

- None of the ten files uses the format's optional tone curve (tags 0x39 and 0x3A), its per-symbol shifts or its non-zero starting values. A file with a curve is refused with a message saying why. Shifts and starting values are read the way LibRaw reads them, but have only been tested on synthetic files.
- Colour still needs the camera's `.dcp` profile, as for every RW2 here. The free Adobe DNG Converter installs them.

With this, ShootFlow reads 22 Panasonic bodies' raw files directly, and every one checked equals LibRaw value for value. The code is MIT licensed in [`ventures/photo-editing`](../../ventures/photo-editing/README.md).
