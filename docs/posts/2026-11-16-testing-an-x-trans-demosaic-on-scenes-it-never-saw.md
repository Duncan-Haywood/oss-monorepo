---
title: "Testing an X-Trans demosaic on scenes it never saw: borrowed Bayer frames as truth"
seo_title: "Testing an X-Trans demosaic against LibRaw on held-out scenes"
date: 2026-11-16
description: "Only two X-Trans raws are public, so we mosaicked six other cameras' scenes with Fujifilm's layout. We led LibRaw's three passes under noise on all seven."
tags: [photo-editing, raw, demosaic, x-trans, evaluation]
---

[photo-editing](../../ventures/photo-editing/README.md) develops raw files from most camera
makers itself, Fujifilm's X-Trans sensors included. X-Trans puts its colour filters in a 6 x 6
pattern rather than Bayer's 2 x 2. That makes rebuilding full colour (demosaicing) harder, and
most open tools fall back on LibRaw's Markesteijn method. Ours is our own code, and on 2026-11-15
it came within half a decibel of LibRaw's three-pass mode.

That claim rested on two real frames, though. The public sample set we use holds only two X-Trans
raws: an X-E1, which we tuned on, and an X-E2. A third frame would settle the choices those two
and a synthetic test sheet disagreed on.

## Borrowing scenes

A known-truth test needs a picture whose right answer is known. We make one by rendering a raw
frame, then averaging it down 4 x 4, which removes nearly all demosaic error and noise but keeps
real edges and textures. The X-Trans layout only matters when we sample that picture back into a
mosaic. So any camera's scene works: we took six Bayer frames (Sony A7 IV, Nikon D800E, Canon 7D,
Panasonic GF7, Samsung NX1, OM System OM-1), binned them and mosaicked them with the X-E1's real
6 x 6 pattern. LibRaw got the same mosaic, written into the X-E1's raw file. The check tool does
this now with `--truth-from FILE`.

## What held

Colour PSNR in dB (higher is closer to the truth). No setting was tuned on any of these seven:

| truth | ours | LibRaw 1 pass | LibRaw 3 passes |
|---|---|---|---|
| X-E2 | 49.43 | 46.45 | 49.89 |
| A7 IV scene | 51.52 | 51.06 | 51.62 |
| D800E scene | 44.86 | 42.11 | 45.16 |
| 7D scene | 50.65 | 48.30 | 49.78 |
| GF7 scene | 30.18 | 27.63 | 27.77 |
| NX1 scene | 45.99 | 40.46 | 45.73 |
| OM-1 scene | 48.61 | 47.07 | 48.17 |

Ours led three passes on four of seven without noise, and on all seven with sensor-like noise
(signal-to-noise 25 at mid grey), by 0.07 to 2.3 dB. It also showed less false colour there on all
seven. One weakness held as well: under noise our brightness channel trails by up to 0.6 dB,
because the final clean-up step puts some of each red or blue sensor's noise into green.

## What did not

The obvious fix for that, keeping green out of the clean-up, had gained 0.4 dB on the X-E1 at every
noise level. On the new scenes it lost on six of seven without noise, by up to 1.4 dB, and broke
even with noise. The X-E1's gain belonged to that frame, not to the method. A second idea, weighting
red and blue by how alike their green neighbours are, did the same: up on the tuning frame, mixed
on everything else. Neither shipped. The first is kept as an option so anyone can re-run the test.

## Why it matters

A photographer judges a raw developer on their own frames, not on our tuning frame. Borrowed scenes
give an X-Trans method many held-out scenes even when only two X-Trans raws are public. They also
caught two changes that would have made most pictures slightly worse.

Full tables and commands: `ventures/photo-editing/eval/xtrans-fresh-truths-2026-11-16.md`.
