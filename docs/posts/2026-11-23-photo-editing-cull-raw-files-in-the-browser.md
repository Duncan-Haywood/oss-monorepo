---
title: "Every raw file carries a JPEG: a browser culler built on that, checked on 65 files"
seo_title: "Cull raw photos in the browser from their embedded JPEGs"
date: 2026-11-23
tags: [photo-editing, raw, culling, lightroom, xmp, browser]
description: "ShootFlow Cull reads the camera's own JPEG from NEF, CR3, ARW, RAF and ORF files, rates them by keyboard and writes Lightroom XMP sidecars. Nothing uploaded."
---

Culling a shoot, going from 900 frames to the 60 worth editing, is slow in a
raw editor because the editor develops each raw file before it shows it.
Photo Mechanic made its name by skipping that step. Every camera raw file
carries a JPEG the camera made at capture, for its own screen, and showing
that JPEG is close to instant.

ShootFlow now has that step as a web page:
[ShootFlow Cull](https://marisstella.app/photo-editing/cull.html). Drop a
card's files or a folder on it. It shows each frame from its embedded JPEG.
You star, label and reject frames from the keyboard, and it downloads XMP
sidecars that Lightroom Classic, Bridge, Capture One or darktable read on
import. The files are read by the browser on your own computer, and nothing
is uploaded.

## Where the JPEG hides

Each maker puts it somewhere different, and that difference is most of the
code in `site/rawpreview.mjs`:

- **Nikon, Sony, Pentax, Samsung, DNG**: TIFF tags
  (`JPEGInterchangeFormat`) in the first image directory or in a sub-directory.
  On the files we tested, every NEF from the D200 on, the Pentax K-1 II and
  the Sony A7 IV store it at full size.
- **Canon CR2**: a JPEG stored as the first image's single strip, full size
  from the 600D on.
- **Canon CR3**: an ISO media file. The full-size 6000 × 4000 JPEG is the first
  track's only sample, found through the track's sample size and offset tables.
- **Fujifilm RAF**: two numbers in the file header. Here the JPEG carries the
  orientation tag itself, which matters (below).
- **Panasonic RW2**: a whole JPEG stored as the value of tag 0x2E.
- **Olympus and OM System ORF**: inside the maker note, in a sub-directory
  whose offsets count from the maker note's own start. The OM-1 and TG-7 use
  a newer header (`OM SYSTEM`, directory at +16), which the parser missed until
  the test files showed it.

When the pointers find nothing usable, a byte scan for JPEG streams is the
last resort. One check runs on every candidate: the frame header must say
baseline or progressive. CR2 and DNG also hold *lossless* JPEG, the raw sensor
data itself, which no browser decodes.

## Rotation, twice

A camera held upright writes orientation 6 or 8 into the raw file's tags, but
usually stores the preview sideways with no tag of its own, so the page
rotates it on a canvas. Fujifilm's preview carries its own tag, and browsers
honour that tag when they decode the JPEG. Rotating again would turn those
frames sideways. The parser reports whether the preview has its own tag, and
the page then leaves the rotation to the browser.

## What it measures, and what it doesn't

Frames from one camera body taken less than 1.5 s apart form a burst. Each
frame gets a detail score: the variance of a Laplacian filter in the busiest
of 16 areas of the preview, the same kind of measure culling apps use for
sharpness. The highest score in each burst is marked "sharpest". Pressing
<kbd>Z</kbd> jumps to 100% at that area to check focus. This is a hint, not a
verdict. It cannot tell a soft subject from a sharp background, and it favours
busy scenes.

## Checked on 65 real files

On the public [metadata-extractor-images](https://github.com/drewnoakes/metadata-extractor-images)
sample set (65 files, 55 camera models, 1.1 GB):

- a preview in **61**; the four misses are two BigTIFF test files, a phone
  DNG with no JPEG inside and a truncated 368-byte file;
- **all 61** decode in Pillow at exactly the size the parser read;
- **39** are 2,000 px wide or more;
- in Chromium the page read all 65 in about **5 seconds**, with all 12
  portrait frames upright.

The full table is in
`ventures/photo-editing/eval/cull-page-previews-2026-11-23.md`. Not checked
yet: an actual Lightroom import of the sidecars (the fields are the
`xmp:Rating` and `xmp:Label` defined in Adobe's XMP specification), Safari and
Firefox, and a real card of several hundred frames. Lightroom does not read
sidecars for JPEG or DNG files, and the page says so.

The code is MIT licensed. For developing the picks with checked colour,
ShootFlow's command-line tools take over
([the project page](https://marisstella.app/photo-editing/)).
