---
title: "ShootFlow's overnight pipeline now develops DNG raw files"
seo_title: "Batch develop DNG raw files to 16-bit TIFF overnight, open source"
date: 2026-11-10
tags: [photography, raw, dng, workflow, open-source]
description: "Drop DNGs on the card and ShootFlow's unattended pipeline develops each into a 16-bit master, grades it and puts it in the reels and carousels. Checked on a real Nikon sensor file."
---

Earlier today ShootFlow got a DNG developer (`shootflow develop`), checked pixel by
pixel against LibRaw. One gap was left. The unattended overnight pipeline, which takes
a card from ingest to graded masters to Instagram reels and carousels, still stopped
at the grade stage whenever a shoot held a RAW still. You had to develop by hand.

That gap is closed now. A DNG on the card is developed in the grade stage into a 16-bit
TIFF and graded with your shoot LUT. It lands as `graded/<job>/IMG_0001.DNG.tif` and
goes into the reels and carousels like any JPEG. Some DNGs carry no embedded JPEG
preview: ones written by converters, or the ones our own test tool writes. Those used
to fail their review proxy and keep placeholder scores. They now get both from a quick
half-size development.

## What we checked

We used a real Nikon file from rawpy's test folder (a NASA photo from the ISS). Its
sensor data was rewritten as a DNG with no preview, and that DNG went on a card beside a
short clip. One `run-local-pipeline` call rendered every deliverable in 75 seconds, with
nothing left for review. The graded master is 4284x2844 at 16 bits per channel. It is
bit-identical to what `shootflow develop` writes for the same file, so the grade stage
loses nothing on the way. The photo was scored from measured sharpness, exposure and
framing rather than the placeholder hash. The full table is in
`ventures/photo-editing/eval/pipeline-dng-grade-2026-11-10.md`.

A test in the suite runs the same path on a synthetic red scene. The master's centre has
to come back as that red's sRGB value, 170/89/80, within 3 steps, and it does.

## What it does not do

Other RAW formats (CR2, CR3, NEF, ARW) are still scored from the preview the camera
embedded. They stop at the grade with a plain message: convert them to DNG with Adobe's
free DNG Converter. The developer is pure Python, about 37 seconds for a 12-megapixel
frame. That is fine for one overnight shoot of a few hundred frames, and too slow for
thousands. Speed is the next piece of work. No camera-written DNG has been through it
yet, either.

ShootFlow is MIT licensed, runs on your own machine and uploads nothing:
`ventures/photo-editing` in the repository.
