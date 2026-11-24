---
title: "A burst's sharpest frame should be sharp where the camera focused. The browser culler now reads the AF point"
seo_title: "Show the AF point of raw files in the browser, free"
date: 2026-11-24
tags: [photo-editing, raw, culling, autofocus, maker-notes]
description: "ShootFlow Cull now reads the AF point from Canon, Sony, Fujifilm, Panasonic and Olympus raws, draws it, zooms to it and ranks bursts by detail there."
---

[ShootFlow Cull](https://marisstella.app/photo-editing/cull.html) is a free
browser page for rating a card of raw files: it shows each from the JPEG the
camera embedded, groups bursts, marks the sharpest frame of each, and writes
XMP sidecars for Lightroom, Capture One or darktable. Nothing is uploaded.

Its "sharpest" used to mean the most edge detail in the busiest sixteenth of
the frame. The page's own help admitted the flaw: a soft face in front of a
crisp brick wall wins, because the wall is the busiest area. That is the
exact mistake a culler is supposed to catch.

## The camera already knows where it focused

Almost every body writes the autofocus position into the raw's maker note,
the vendor's private block of EXIF. Paid viewers such as FastRawViewer and
Photo Mechanic draw it; Lightroom does not. The layouts differ by maker, and
the page now reads five of them:

- **Canon** (CR2 and CR3): AFInfo2, a list of point boxes measured from the
  centre of the frame, with a bitmask of the ones in focus. A Canon R8 lists
  1,053 points; the page shows only the ones the camera reports in focus.
- **Sony** (A7 III and later): FocusLocation, the full-size width and height
  and the focus x, y.
- **Fujifilm**: FocusPixel, in the frame of the embedded JPEG.
- **Panasonic**: AFPointPosition, two fractions of the frame.
- **Olympus and OM System**: AFAreas, up to 64 boxes packed into bytes.

Nikon is the gap: its phase-detect points are numbered on a grid that
differs by body and Nikon publishes no coordinates, so Nikon files keep the
old busiest-area score. Older Sony bodies (NEX-7, A5000) write no position.

## What changes on the page

- The large view draws the AF points, red where the camera reports focus.
  `F` hides them.
- `Z` zooms to 100% at the AF point instead of the busiest area, which is
  where you wanted to check focus anyway.
- In a burst where every frame has an AF point, the "sharpest" badge goes to
  the frame with the most detail at that point and says "sharpest at AF".
- A new sort: detail at the AF point, most first.
- The CSV export gains `af_x`, `af_y`, `af_detail`, `af_source` and
  `sharpest_by`.

## How we checked it

On the public [metadata-extractor-images](https://github.com/drewnoakes/metadata-extractor-images)
raws, the sample repository also ships metadata-extractor's own decoding of
each file. For the 22 files whose AF tags it decodes (Sony, older Canon,
Fujifilm, Panasonic, Olympus), the page's point matches to the pixel on all
22, including the seven where the camera recorded no position.

metadata-extractor does not decode Canon's newer AFInfo2 or the CR3 note, so
the photos had to be the second judge. If the point is read correctly, it
should sit on edges, since that is what autofocus locks onto. Across the 24
files with a point, the detail at the point ranks above the middle of the
frame in 18, with a median rank of 0.89 out of 1. The misses are plain
targets the camera really did lock on: a hazy sky over a sea horizon,
overcast cloud, a snowy slope.

The same test settled a sign. Canon stores the vertical position with up as
positive, which is easy to get backwards. On the five Canon files whose point
is off the centre line, the point as read beats the same point flipped top
to bottom on four. On a Canon 600D sunset, the six points the camera marked
in focus sit on the tree line and the two it did not are in open sky.

The full tables are in
[eval/cull-af-point-2026-11-24.md](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/cull-af-point-2026-11-24.md).

## What is not known yet

Whether ranking by detail at the AF point picks the frames a photographer
actually keeps. That needs a real burst-heavy card and that photographer's
picks; the page's CSV now has the columns to compare against.
