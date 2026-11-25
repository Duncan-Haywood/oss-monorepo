---
title: "Nikon's HLG raws hide their previews as HEVC video frames. The browser culler now opens them"
seo_title: "Cull Nikon Z8 HLG NEF raws in the browser, free"
date: 2026-11-24
tags: [photo-editing, raw, culling, nikon, hevc]
description: "Z8 and Z9 raws shot in HLG carry HEVC previews, not JPEGs. ShootFlow Cull now decodes them with the browser's own decoder and reads 1 MB of 143 MB."
---

[ShootFlow Cull](https://marisstella.app/photo-editing/cull.html) is a free
browser page for rating a card of raw files from the preview each one carries.
It reads a raw's structure and its embedded JPEG, never the sensor data, which
is what makes a 500-file card load in under half a minute.

A Nikon Z 8 or Z 9 shooting in its HLG tone mode breaks that. The camera still
writes two previews, 1620 x 1080 and 320 x 212, but as single HEVC video
frames (10-bit, BT.2020, the HLG curve) rather than JPEGs. Until today the page
found only the 160 x 120 thumbnail and, hunting for a larger JPEG, read every
50 MB file whole.

What changed:

- The reader recognises the HEVC streams (the NEF compression code on a
  reduced-size image, a stream that opens with a video parameter set) and
  reads the codec string from the stream itself: `hev1.2.4.L120.B0.10`, Main
  10 at level 4, one picture. It stops there: on three public Z8 files it
  read **1 MB of 143 MB**, against all 143 MB before.
- Where the browser has an HEVC decoder (Safari; Chrome and Edge on hardware
  that decodes HEVC) the page hands it the frame through WebCodecs and shows
  the full 1620 x 1080 preview. Elsewhere it keeps the thumbnail and says why.

The bigger preview matters for more than looks. On these files, detail at the
camera's AF point ranked at median 0.92 of the frame on the 1620 px preview
and 0.73 on the thumbnail, so picking the sharpest frame of a burst works far
better on it.

What is not checked yet: the headless Chromium used for testing has no HEVC
decoder, so the decode step was checked with ffmpeg standing in for the
browser's decoder; a real Safari decode of these frames, and how its
HLG-to-screen mapping looks, is the next thing to see. Details and the
commands to repeat it are in
[the measurement note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/cull-hevc-previews-2026-11-24.md).
