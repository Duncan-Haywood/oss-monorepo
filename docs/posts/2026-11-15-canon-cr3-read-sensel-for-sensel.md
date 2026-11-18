---
title: "Reading Canon CR3 raw files without a converter, sensel for sensel"
seo_title: "Canon CR3 raw decoder in Python: CRX lossless matches LibRaw exactly"
date: 2026-11-15
tags: [photo-editing, shootflow, raw, canon, cr3, image-processing]
description: "ShootFlow now develops full-quality Canon CR3 raw files directly: on two real EOS R8 frames, all 25.5 million sensor values match LibRaw's."
---

ShootFlow is the open-source photo pipeline in this repository. It ingests a card, scores and culls
the frames, and develops raw files into 16-bit TIFF masters overnight. It has read Canon CR2 since
12 November. But no Canon camera sold in the last seven years writes CR2. The EOS R, R5, R6, R8,
R50 and M50, and the 90D, all write CR3. Until today a CR3 had to go through Adobe's DNG Converter
first.

Now it doesn't, as long as the file was shot at the full "RAW" quality:

    shootflow develop IMG_0036.CR3 --dcp "Canon EOS R8 Adobe Standard.dcp"

That takes 2.7 seconds on four cores, from the file to a 6000 x 4000 16-bit master. The overnight
pipeline's grade stage now takes CR3 the same way.

## A raw file that is an MP4

A CR3 is not a TIFF. It is an ISO base media file, the same family of box formats as MP4, with the
brand `crx`. Canon's own `uuid` box holds four small TIFF files: IFD0 (camera name), EXIF, the maker
note and GPS. The sensor data is the sample of the third track. Its sample entry carries a `CMP1`
box, the codec header: size, bits, planes, CFA layout and wavelet levels.

Two things were not where the CR2 reader looked for them:

- **White balance** is not in the maker note. It is in the fourth track, a timed-metadata (`CTMD`)
  stream with one record per frame. Record type 8 carries a maker-note fragment with ColorData,
  and on the R8 and R3 the as-shot levels sit at index 0x69.
- **Black level** moved too. On a CR2, the columns left of the crop are masked, and their median
  is the black level. On the R8 that rule read 2053-2054 against LibRaw's 2047. The column medians
  showed why: the masked columns end near column 154, but the crop starts at 168, and the columns
  between them are exposed. A small `IAD1` box in the raw track lists the rectangles: crop, left
  optical black (columns 0 to 155), top optical black and active area. Measuring black inside the
  left optical black gives 2047-2048.

## The codec, and the one detail found by brute force

Canon's CRX codec, at its lossless setting, splits the sensor into four planes, one per position in
the 2x2 colour filter. It codes each plane line by line. Each sample is predicted from its
neighbours with the median edge detector from LOCO-I: the left value, the value above, or left plus
above minus above-left. The error goes out as an adaptive Rice code. Where the line is flat (left =
above = above-right), a run mode codes how many samples repeat. Run mode uses the run-length table
from JPEG-LS.

Our decoder follows the format as LibRaw's `crx.cpp` decodes it, written independently, and uses
LibRaw's raw values as the oracle. The first version decoded lines 0 to 2 of plane 0 exactly, then
broke at the start of line 4. Brute-forcing the run index at that point changed nothing, so the run
index wasn't the cause. Brute-forcing the Rice parameter instead got within six samples, which
pointed back at the run before it. That run reached the end of line 3.

The cause: in JPEG-LS, a run's first 1 bit already adds a block of 1 << J[s] samples. In CRX the
first 1 bit only says "a run starts" and counts one sample. Each further 1 adds 1 << J[s]. A run
that stops short of the line end codes the same bits either way, so the error only showed up when a
run hit the line end. Once the flag counted as one sample, the whole plane decoded exactly.

## How close

Checked against LibRaw 0.22 on the five CR3s in the public metadata-extractor-images collection:

| file | sensels differing | white balance | black (ours / LibRaw) | read time |
| --- | --- | --- | --- | --- |
| EOS R8, IMG_0036 | 0 of 25,494,560 | equal | 2047-2048 / 2047 | 0.53 s (C) |
| EOS R8, _MG_0039 | 0 of 25,494,560 | equal | 2048 / 2047-2048 | 0.51 s (C), 34.6 s (Python) |

The pure-Python decoder is the reference. The C one comes through the same optional ctypes library
the other raw readers use, and the two agree sensel for sensel.

The other three files (an R3 and two R8 frames) are C-RAW, the smaller quality setting. They are
refused with that reason and a pointer to the DNG Converter. C-RAW codes the planes as a
three-level 5/3 wavelet with quantised subbands. It is the next item, and three real files are at
hand to check it against.

Against LibRaw's rendered image, rather than its raw values, the median difference is 2.3 8-bit
steps. The sensor data, white balance and black level all match, so this gap is the colour model.
These frames were shot at about 3,400 K, warm indoor light. That is where the DNG specification's
model (white adapted in XYZ) and dcraw's (camera channels scaled, then a D65 matrix) part most. The
CR2 work found the same on a 4,700 K Canon 70D frame. Telling which model is closer needs a colour
chart shot under that light.

The details, the commands to reproduce the check, and what is not done yet are in
`ventures/photo-editing/eval/canon-cr3-reader-2026-11-15.md`.
