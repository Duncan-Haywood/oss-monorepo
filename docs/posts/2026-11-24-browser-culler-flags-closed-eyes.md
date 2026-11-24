---
title: "Find the blink before you pick the frame: the browser culler now flags closed eyes, on your own computer"
seo_title: "Flag closed eyes in raw photos in the browser, free"
date: 2026-11-24
tags: [photo-editing, culling, faces, mediapipe, privacy]
description: "ShootFlow Cull now flags closed eyes with a face model that runs in the browser. What it caught, what it missed, and why one closed face is not an error rate."
---

[ShootFlow Cull](https://marisstella.app/photo-editing/cull.html) is a free
browser page for culling a card of raw files: it shows each from the JPEG the
camera embedded, groups bursts, marks the sharpest frame, reads the AF point
and writes XMP sidecars for Lightroom, Capture One or darktable. Nothing is
uploaded.

The paid AI culling apps (Aftershoot, Narrative Select, FilterPixel) all lead
with the same feature: they flag the frames where someone blinked. A burst's
sharpest frame is no keeper if the bride has her eyes shut. The page had no
answer to that until today.

## What it does

Tick **Check for closed eyes** above the grid. The page downloads Google's
MediaPipe Face Landmarker (Apache-2.0, a 3.6 MB model) once and runs it in the
browser on a 1,024 px copy of each preview. The photos are still read on your
computer and never sent anywhere.

The model gives each face a blink score per eye. The page calls a face
eyes-closed when both scores reach 0.45, so a wink or a one-sided squint does
not count, and it ignores faces under 1% of the frame, the people in the
background. A blinking frame gets an "eyes closed" tag, a filter of its own,
CSV columns and an amber box in the large view. The sharpest-of-burst pick then
skips blinking frames, unless every frame in the burst has one.

## What it caught

We drove the real page in headless Chromium and read its own CSV export:

- **10 portraits**: MediaPipe's own test photos plus three images from the
  MIT-licensed `eye-opener` project, which says they are AI-generated. Among
  them is a group of three where one man has his eyes closed, and the same
  group with everyone's eyes open. The page flagged that one frame and nothing
  else. The 12 open-eyed faces scored 0.005 to 0.27, smiling and squinting
  faces at the top of that range. The closed pair scored 0.61 and 0.63.
- **65 real camera raws** from the public metadata-extractor sample set. The
  page found faces in 6 and flagged none. We checked those 6 by eye, and every
  face has open eyes or is behind sunglasses. Each check took about 80 ms a
  frame, so a 500-frame card takes under a minute.

## Why we call it a hint

The 0.45 line sits between the highest open score (0.27) and the lowest closed
one (0.61). That gap is what we measured, but it rests on **one** closed face,
and that face is AI-generated. It brackets the line. It does not tell you how
often the page will miss a blink or flag an open eye. We have not tested
half-closed eyes, profiles or heavy blur. Sunglasses read as open: the model
cannot see a blink behind them. So the page tags a frame and leaves the
rejecting to you.

What would turn the hint into a number: a licensed set with many real blinks,
such as a group burst shot for the purpose. The full method and per-file
results are in the venture's
[eval note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/cull-closed-eyes-2026-11-24.md).

*Written with AI assistance. ShootFlow is early-stage, free, MIT-licensed
software provided as-is; keep your own backups.*
