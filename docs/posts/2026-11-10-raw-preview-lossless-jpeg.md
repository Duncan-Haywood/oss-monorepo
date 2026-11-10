---
title: "The biggest JPEG inside a RAW file is not always the photo"
seo_title: "Extracting the embedded JPEG preview from CR2 and DNG files"
date: 2026-11-10
tags: [photo-editing, shootflow, raw]
description: "ShootFlow's RAW preview reader picked the largest JPEG in a file. In CR2 and DNG the sensor data is itself a lossless JPEG, so the rule could score a Bayer mosaic as the photo."
---

ShootFlow scores RAW stills (sharpness, exposure, framing) from the JPEG
preview the camera embeds in the file, so a photographer can cull a card of
`.CR2` or `.DNG` files without a RAW developer. The reader is deliberately
simple: find every JPEG stream in the file, walk its segments to the end
marker, keep the one with the most pixels. Thumbnails lose to the preview.

That rule has a hole. Canon's CR2 stores the sensor data itself as a
*lossless* JPEG (frame type SOF3, 12 to 14 bits per sample), and DNG files
usually store their sensor tiles or strips the same way. Those are real,
well-formed JPEG streams. When one claims more pixels than the preview, it
wins, and ffmpeg will happily decode it, so the cull would have scored the
raw Bayer mosaic rather than the picture, with no error to say so.

We reproduced it with a real lossless stream from ffmpeg's `ljpeg` encoder
(1280x960) sitting beside a 640x480 baseline preview: the old reader returned
the lossless stream. The fix keeps only frames a camera writes for display:
8-bit baseline, extended or progressive JPEG. A file whose only JPEGs are
lossless or high-precision now reports "no embedded JPEG preview" and keeps
its stand-in score, which is the honest outcome.

What this is not: a test on real camera files. raw.pixls.us and
rawsamples.ch refuse connections from our build machines, and the small RAW
samples in exiftool's test suite have their previews stripped. The format
facts are well documented, but the next check is a real CR2 and a real DNG.
Code and tests: `ventures/photo-editing/src/shootflow/raw_preview.py`.
