---
title: "Most cameras were still getting the softest demosaic. We replaced it and scored it against LibRaw's seven"
seo_title: "A directional Bayer demosaic, measured against LibRaw's seven"
date: 2026-11-15
tags: [photography, raw, demosaic, bayer, libraw, open-source, photo-editing]
description: "A directional Bayer demosaic for ShootFlow beats bilinear on every test and has the best colour of LibRaw's seven methods on five of six. Where it loses, too."
---

ShootFlow, the open-source photo workflow in this repository, reads raw files from Canon, Nikon,
Sony, Olympus, Panasonic, Samsung, Pentax and Fujifilm and checks every value it reads against
LibRaw. Reading the sensor values correctly is only half the job, though. Each sensel records one
colour, and the developer has to rebuild the other two at every pixel. This step is called
demosaicing. For Fujifilm's X-Trans sensors we built a careful method this week
([today's post on it](2026-11-15-x-trans-demosaic-the-choice-was-the-weak-step.md)). For
everything else, which means the Bayer sensor in nearly every camera, ShootFlow still averaged each
missing colour over its 3x3 neighbours. That is bilinear interpolation. It is soft, and along every
sharp line it mixes the two sides, which shows up as zipper patterns and colour fringes.

We set out to fix the Panasonic GH6's raw format today. The only public source of those files was
blocked from this session's network, so we did this instead. It touches far more photos.

## What the new demosaic does

There are three steps, all from published ideas and all in our own code:

1. At each red or blue sensel, estimate green twice: once along the row and once down the column.
   Each estimate is the two neighbouring greens' mean plus a quarter of the sensel's own second
   difference, so the sensel's detail comes through (Hamilton and Adams, 1997).
2. Decide which way the edge runs. Along an edge, green minus red changes slowly. Across one it
   jumps. We sum how fast that colour difference changes along the row and along the column over a
   5x5 window, and blend the two greens towards the smoother direction. The test is the one Menon,
   Andriani and Calvagno published in 2007.
3. Fill red and blue as colour differences from green, weighting each neighbour by how smooth the
   raw is in its direction.

## How we scored it

Most demosaic papers score on the Kodak test images. We used real frames instead: five raw files
from five makers (Canon 70D, Nikon D810, Sony A7 III, Olympus E-M10, Pentax K-1 Mark II). LibRaw
renders each one, and we shrink the render 4x4. That keeps the real edges, textures and colours and
averages away nearly all of the original demosaic's error. We sample that picture through the
camera's own colour filter pattern and ask each method to rebuild it. We also use a synthetic sheet
with a zone plate, coloured discs and a slanted colour edge, the kind of picture where demosaics
make false colour.

The methods we compare against are LibRaw's own: linear, VNG, PPG, AHD, DCB, DHT and AAHD. We
write the same mosaic into the raw file's sensor data in memory and let LibRaw run on it. We tuned
on the Canon, the Nikon and the sheet only. We ran the other three files once, with the settings
already fixed.

Colour PSNR (higher is better) and false colour (the 99th percentile of the colour error, lower is
better):

| truth | bilinear | **ours** | best LibRaw method |
|---|---|---|---|
| Canon 70D | 44.31 dB / 33 | **47.90 / 19** | AAHD 47.46 / 20 |
| Nikon D810 | 52.36 / 15 | **57.50 / 8** | AAHD 56.36 / 9 |
| test sheet | 21.72 / 368 | **35.59 / 119** | AAHD 34.74 / 136 |
| Sony A7 III (held out) | 35.69 / 70 | 35.94 / **64** | VNG **36.01** / 65 |
| Olympus E-M10 (held out) | 30.40 / 208 | **42.67** / 46 | AAHD 42.62 / **45** |
| Pentax K-1 II (held out) | 27.54 / 177 | **29.16 / 139** | VNG 28.99 / 145 |

Compared with what ShootFlow did yesterday, false colour is down 9% to 78% on every test. Compared
with LibRaw, ours has the best colour PSNR on five of the six and the least false colour on five of
the six. It is the default whenever numpy is installed, and a 24-megapixel frame takes 1.8 seconds
on four cores.

## Where it loses

We are publishing these results too:

- **Fine, aliased texture.** The A7 III and the K-1 Mark II frames are full of detail near the
  sensor's limit. The K-1 Mark II has no anti-aliasing filter at all, and every method scores low
  on these two. On them our luma, the brightness detail, comes out 0.8 to 1 dB behind bilinear,
  DCB or VNG. The gain on those frames is in colour, not sharpness.
- **Heavy noise.** With strong simulated sensor noise added, a plain 3x3 average gets the higher
  colour PSNR on two frames, because averaging also smooths noise. It still leaves 1.2 to 1.9 times
  the false colour.
- **A median pass we turned down.** A 3x3 median of the colour differences gains up to 1.9 dB on
  the test sheet. It loses on three of the five real frames and on 8 of the 10 noisy ones, so it is
  off by default. Real frames decide.

All the numbers, the commands and every raw row are in
[`ventures/photo-editing/eval/bayer-directional-demosaic-2026-11-15.md`](../../ventures/photo-editing/eval/bayer-directional-demosaic-2026-11-15.md).
The check tool, `tools/bayer_demosaic_check.py`, runs on any Bayer raw file that LibRaw reads.

ShootFlow is MIT licensed and runs on your own machine. Nothing is uploaded.
