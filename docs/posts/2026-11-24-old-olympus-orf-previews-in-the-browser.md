---
title: "Old Olympus ORF files had a 160 px preview. The browser culler now develops them"
date: 2026-11-24
tags: [photo-editing, raw, olympus, colour, culling]
description: "Four 2000s Olympus compacts store only a 160 x 120 JPEG. ShootFlow Cull now develops them from the sensor data and reads BigTIFF DNGs too."
seo_title: "Old Olympus ORF raw files: a real preview in the browser"
---

[ShootFlow Cull](https://marisstella.app/photo-editing/cull.html) is a free
page for picking frames from a card of raw files. It runs in the browser and
uploads nothing. It works fast because it shows the JPEG each camera stores
inside its raw files instead of decoding the sensor data. That fails when the
camera stored nothing worth showing.

Four bodies in the public test set we use
([metadata-extractor-images](https://github.com/drewnoakes/metadata-extractor-images))
have this problem: the Olympus C-5050 Zoom, C-8080, SP-350 and SP-500 UZ. Our
own notes said the page "missed their 640 px previews". It didn't. Scanning
every byte of the four files for JPEG markers finds exactly one JPEG in each,
160 x 120 pixels. No larger picture is stored. If you shot a card on one of
these cameras, the culler showed postage stamps.

## Developing them instead

So the page now develops those files itself, in a background worker. This is
the same thing it already did for phone DNGs that store no JPEG. The layout is
unusual. Each sensor value is 12 bits, packed most significant bit first, and
the rows are stored out of order: all the even rows, then the odd rows,
starting from the next 2,048-byte boundary. When the file's own header gives
an odd height, the camera actually stored one more row, past the end the
header describes. The page reads that row too. Every sensor value it reads
matches our Python reader on all four files, and that reader matches LibRaw.
White balance comes from Olympus's maker note. The previews come out 1,288 to
1,640 px wide, eight to ten times the width of the thumbnails.

## The colour question

These files carry no colour matrix, which a DNG would have. Without one,
camera RGB comes out flat: about half to three quarters of the saturation
LibRaw's development gives. We tried three fixes and scored each one against
LibRaw's own development of the same files, using LibRaw's matrices (Adobe's)
as the judge:

- **Fit a matrix to the camera's own thumbnail.** It sounds clever, since
  the camera made that JPEG from the same frame. It was best on one file and
  worst on another, and on the SP-350 it produced a matrix no real sensor has.
- **The same fit, with the JPEG's tone curve divided out.** This
  over-saturated every file.
- **One fixed matrix: the average of what five other cameras wrote into their
  own DNGs.** It came out better than no matrix on all four files. The median
  colour error dropped from 3.4 to 2.1 CIEDE2000, averaged over the four.

The page ships the plain average. It is a preview for choosing frames, not a
colour profile, and on two of the four bodies it stays about 3 ΔE away from
LibRaw. The scores, and the caveat that only four files were tested, are in
the [write-up](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/cull-orf-compacts-2026-11-24.md).

## BigTIFF too

The same change taught both of the page's readers BigTIFF, the TIFF variant
with 8-byte offsets. DNG allows it for files over 4 GB, such as large
stitched panoramas. The two BigTIFF test files in the sample set now show
their previews. Before, they showed nothing.

ShootFlow is MIT-licensed. The culler is at
[marisstella.app/photo-editing/cull.html](https://marisstella.app/photo-editing/cull.html).
It isn't professional editing advice, and it comes with no warranty.
