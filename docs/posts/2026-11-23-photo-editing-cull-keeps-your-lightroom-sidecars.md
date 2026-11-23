---
title: "Unzipping a culler's sidecars over Lightroom's wiped the edits. Now it merges them"
seo_title: "Cull raw files without overwriting Lightroom XMP sidecars"
date: 2026-11-23
tags: [photo-editing, raw, culling, xmp, lightroom]
description: "ShootFlow Cull now reads existing .xmp sidecars and in-camera ratings, and hands your own sidecars back with only the rating and label changed."
---

[ShootFlow Cull](https://marisstella.app/photo-editing/cull.html) lets you
star and reject a card of raw files in the browser, then download XMP
sidecars that Lightroom, Bridge, Capture One or darktable read on import.
Until today it had a bad habit: every sidecar it wrote was new, ten lines
long and holding only a rating.

That is fine for a fresh card. It is not fine for a folder you have already
opened in Lightroom Classic or Camera Raw. There, `IMG_0001.xmp` holds the
develop settings (every `crs:` value), the crop, keywords and captions, next
to the rating. The page told you to unzip its sidecars into the raw folder.
Doing that replaced all of it.

## What it does now

- **Drop the .xmp files with the raws.** The page pairs `IMG_0001.CR3.xmp`
  (darktable, digiKam) exactly and `IMG_0001.xmp` (Adobe, Capture One) with
  the one raw of that stem. It refuses to guess when `IMG_0001.CR3` and
  `IMG_0001.JPG` both exist.
- **Each frame starts from the marks it already has**: what you set on this
  page before, else the sidecar's `xmp:Rating` and `xmp:Label`, else the
  rating the camera wrote into the raw (the XMP packet TIFF raws carry in tag
  700, a CR3's XMP box, or the Rating tag 0x4746).
- **Download gives your own sidecars back**, under their own names, with only
  `xmp:Rating`, `xmp:Label` and `xmp:MetadataDate` changed. Everything else
  stays byte for byte.

## How it was checked

A Lightroom-shaped sidecar (2 stars, Purple, an exposure and a crop) went
into headless Chromium with a Nikon D810 raw. After re-rating it to 5 stars
and Green from the keyboard, the downloaded zip's `Nikon D810.xmp` differed
from the dropped one in exactly three lines: MetadataDate, Rating, Label.
Python's own `zipfile` read the zip.

On the 65 public raws of
[metadata-extractor-images](https://github.com/drewnoakes/metadata-extractor-images),
16 carry an XMP packet. Only one holds a real rating: a Pentax Q-S1 DNG, 3
stars. The page found it, and so did a separate byte scan. The other 15 say 0
or have no rating, and the page leaves them unrated. Reading each file whole
and reading only the bytes the parser asks for gave the same answer on 65 of
65.

## What is not known yet

Nobody has watched Lightroom read a merged sidecar. That Metadata › Read
Metadata from Files picks up the new rating is Adobe's documented XMP
behaviour, not something seen here. The Rating-tag path has no real rated
file behind it, only a unit test: the two samples that write the tag (OM-1,
TG-7) say 0. A card that was rated in the camera would settle both.

The full note is in the repository:
`ventures/photo-editing/eval/cull-existing-sidecars-2026-11-23.md`.
