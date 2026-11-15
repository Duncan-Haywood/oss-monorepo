---
title: "A directional demosaic for Fujifilm X-Trans, scored against known truth"
seo_title: "X-Trans demosaic: bilinear, directional and LibRaw compared"
date: 2026-11-14
tags: [photography, raw, fujifilm, x-trans, demosaic, libraw, open-source, photo-editing]
description: "ShootFlow now demosaics Fujifilm X-Trans directionally: 1.8 to 13 dB nearer known truth than bilinear, still 2 to 6 dB behind LibRaw's three-pass method."
---

This morning ShootFlow, the open-source photo workflow in this repository, learned to read Fujifilm RAF files, including the X-Trans ones with their 6x6 colour layout ([the earlier post](2026-11-14-fujifilm-x-trans-raw-files-without-the-converter.md)). It then turned the colour mosaic into a full-colour picture with the simplest method there is: each missing colour is the mean of that colour's sensels in the 3x3 window around the pixel.

That is correct, but it is soft, and it averages across edges. On a red-on-blue edge, a pixel just inside the red side gets some blue in its average, and the edge comes out with a coloured fringe. X-Trans makes this worse than Bayer, because its red and blue sensels are spaced irregularly. Depending on which of the 36 positions a pixel sits at, the 3x3 window holds one, two or three red sensels, in different places.

## What replaced it

The new demosaic follows an idea Frank Markesteijn described for X-Trans, which dcraw and LibRaw ship as their X-Trans method. It builds the green plane four times, each time interpolating only along one line: across, down, or one of the two diagonals. Along an edge, the line that runs with the edge gives a green that stays on its own side. Red and blue follow from each green. Then each pixel keeps the version that is most even around it, measured in CIE L\*a\*b\* so that "even" means even to the eye. A 3x3 median of the colour differences cleans up what is left.

We wrote it from the idea, not from dcraw's or LibRaw's source. Their licences are not MIT, and this repository is.

## How we scored it

You cannot score a demosaic on a real photo by eye alone, because you don't know what the missing colours really were. So we made pictures where we do know:

- **The real frames, shrunk.** We took the X-E1 and X-E2 test files, rendered them with LibRaw and binned each 4x4 block into one pixel. That leaves real edges, textures and colours with almost no demosaic error or noise. Then we sampled those pictures through the camera's own X-Trans layout and asked each method to put the colour back.
- **A synthetic sheet.** It has a zone plate (rings that get finer up to the finest detail the sensor can hold), a slanted red and cyan edge, and coloured discs on grey.

To compare with LibRaw on the same input, we wrote each mosaic into the RAF's sensor data in memory and let LibRaw demosaic it. So LibRaw runs its own methods on exactly the pixels ours sees.

Higher PSNR is closer to the truth; 6 dB is half the error.

| test | ours, bilinear | ours, directional | LibRaw, 1 pass | LibRaw, 3 passes |
|---|---|---|---|---|
| X-E1 frame | 34.8 dB | 36.6 dB | 37.5 dB | 39.3 dB |
| X-E2 frame (held out) | 42.0 dB | 47.9 dB | 46.5 dB | 49.9 dB |
| synthetic sheet | 20.3 dB | 33.5 dB | 25.9 dB | 39.4 dB |

The worst false colour, the 99th percentile of the colour error, fell by 27%, 55% and 75% against bilinear. The new method beats LibRaw's one-pass version on two of the three tests. LibRaw's three-pass version is still 2 to 6 dB better than ours on all three.

We tuned only on the X-E1 and the sheet, and looked at the X-E2 once, with the final settings.

## What didn't work

- **More passes.** Feeding the first result back in as the starting point helped the sheet (35.8 dB with three passes) but dropped the X-E1 frame to 34.5 dB, below plain bilinear. The option is there, but it is not the default.
- **Our guess about half size.** The developer's half-size output on X-Trans demosaics at full size and then averages 2x2 blocks. We expected the averaging to hide most of the difference and planned to keep the fast bilinear method there. The measurement said otherwise: 38.9 to 40.1 dB on the X-E1, 46.5 to 52.1 on the X-E2, 24.0 to 37.4 on the sheet. So the directional method is the default at both sizes.
- **One result we can't explain yet.** On the real sensor data, with its noise, our directional output's colour is closer to LibRaw's three-pass render than bilinear's is, but its brightness detail is further away. LibRaw's render isn't the truth, so this isn't a score. Our known-truth tests have no noise, though, and the next test should add it.

## Cost

The first working version took 21 seconds and 3.5 GB for a 16-megapixel frame. Profiling found the slow parts: padding the whole frame for every shifted view, and computing the colour conversion three times over. Fixing them, and working in 32-bit floats, brought it down to 7 to 8.5 seconds on four cores, with every score unchanged to two decimals. Bilinear takes 0.9 seconds. LibRaw's three-pass method, in C, takes 1.7. A C version of ours is the obvious next step for speed.

To use it: `shootflow develop DSCF0001.RAF --dcp FOLDER`. It is the default for X-Trans files whenever numpy is installed, and `--demosaic bilinear` brings back the old method. The details and raw numbers are in the venture's [evaluation note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/xtrans-directional-demosaic-2026-11-14.md).
