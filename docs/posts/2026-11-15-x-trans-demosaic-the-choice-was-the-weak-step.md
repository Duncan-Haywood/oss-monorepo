---
title: "Our X-Trans demosaic chose a direction no better than averaging. Fixing that nearly caught LibRaw"
seo_title: "X-Trans demosaic: a smoothness blend and a clamp, near LibRaw"
date: 2026-11-15
tags: [photography, raw, fujifilm, x-trans, demosaic, libraw, open-source, photo-editing]
description: "The direction choice in our X-Trans demosaic did nothing on a real frame. A smoothness blend and a clamp bring it within 0.5-0.7 dB of LibRaw."
---

Yesterday ShootFlow, the open-source photo workflow in this repository, got a directional demosaic for Fujifilm's X-Trans sensors ([yesterday's post](2026-11-14-a-directional-demosaic-for-fujifilm-x-trans.md)). It builds four full-colour pictures, each one interpolating green along a single line (across, down, or one of the two diagonals). Then each pixel keeps the picture that is most even around it. It beat bilinear by 1.8 to 13 dB, but it was still 2 to 6 dB behind LibRaw's three-pass Markesteijn method.

Today we didn't guess at the next fix. We first measured where the error was coming from.

## The direction choice was doing nothing

The test is yesterday's known-truth setup. We take a real X-E1 frame, shrink it 4x4 so almost no demosaic error is left, sample it through the camera's X-Trans layout and ask the demosaic to put the colour back. On that frame we compared three ways of combining the four directional pictures:

| how the four pictures are combined | colour PSNR |
|---|---|
| the even-in-L\*a\*b\* choice we shipped | 36.38 dB |
| a plain average of all four | 36.39 dB |
| the best direction at each pixel, picked by looking at the truth | 40.03 dB |

The choice, which is the step that makes a directional demosaic directional, was no better than averaging. On the synthetic sheet (a zone plate, a slanted colour edge and coloured discs) it was worse than averaging: 30.75 against 33.93 dB before the clean-up median. The pictures were there to choose from. Our choosing was the problem.

## Two changes

**A blend weighted by smoothness.** For each direction we take the picture's second difference along that direction's own line, summed over the three colours and a 3x3 window. That gives D, which is small where the line runs with the edges. Each picture is then weighted by (D_min / D)^4. The smoothest direction dominates, but when two directions are nearly tied they are blended instead of flipping from one pixel to the next. We tried powers 1, 2 and 4, a hard pick, and the same measure in L\*a\*b\*. Power 4 in plain camera RGB did best.

**A clamp on the green.** Each directional green is a colour difference: the neighbouring greens minus an estimate of the pixel's own colour at their sites, with the pixel's own value added back. Where that estimate is off, on fine texture or right at an edge, the result overshoots. It can land above both greens it was interpolated from, which is almost never right. Holding it between those two greens gave the largest single gain of the day: 1.7 dB on the X-E1 frame before the median.

## Results

We tuned on the X-E1 frame and the sheet only. We looked at the X-E2 frame once, with the final settings.

| test | yesterday | today | LibRaw, 1 pass | LibRaw, 3 passes |
|---|---|---|---|---|
| X-E1 frame | 36.60 dB | 38.56 dB | 37.48 dB | 39.27 dB |
| X-E2 frame (held out) | 47.88 dB | 49.43 dB | 46.45 dB | 49.89 dB |
| synthetic sheet | 33.51 dB | 35.00 dB | 25.89 dB | 39.37 dB |

On the two real frames we now trail LibRaw's three-pass method by 0.71 and 0.46 dB, down from 2.7 and 2.0. The worst false colour (the 99th percentile of the colour error) fell by another 20 to 33%. The new choice is also cheaper, because it no longer converts four pictures to L\*a\*b\* to compare them.

The sheet is where the gap is still large, 4.4 dB. Most of it is in the zone plate's finest rings, close to the finest detail the sensor can record. Our extra passes help there (36.6 dB with three) but cost the real frame half a dB, so they stay off by default.

## With noise

All of that was on noise-free pictures, and real sensors are noisy. So we also added sensor-like noise to the mosaic: shot noise plus read noise, at a signal-to-noise ratio of 60 or 25 at 18% grey. We scored every method against the clean truth, and LibRaw got the same noisy mosaic. These are noise levels we chose, not ones measured from a camera.

| test | yesterday | today | LibRaw, 3 passes |
|---|---|---|---|
| X-E1 frame, SNR 60 | 36.44 dB | 38.34 dB | 38.99 dB |
| X-E1 frame, SNR 25 | 35.80 dB | 37.42 dB | 37.85 dB |
| X-E2 frame, SNR 60 | 45.32 dB | 46.20 dB | 46.29 dB |
| X-E2 frame, SNR 25 | 40.38 dB | 40.79 dB | 40.67 dB |

At the noisier level on the held-out X-E2 we come out 0.12 dB ahead. The noisy test also explained yesterday's open question: on real sensor data our brightness detail was further from LibRaw's than bilinear's was. The cause is the final clean-up median. It rebuilds green at each red or blue pixel from that pixel's own value, so that pixel's noise ends up in green. Without the median, our output's brightness is closer to LibRaw's than bilinear's is on both real frames. The median stays for now because the sheet needs it. A median that leaves green alone gains 0.4 dB on the real frames and loses 2.4 dB on the sheet, and settling that needs a real noisy photo with a known answer.

## What didn't make the cut

- **A wider, Gaussian-weighted average for red and blue.** It gave +0.5 dB on the sheet and -0.1 on the X-E1 frame. That was too mixed to be worth the extra code.
- **Clamping to every green in the 3x3 window** instead of the two on the line. That was 0.5 dB worse on the X-E1 than the line clamp.
- **Dropping the median clean-up**, now that the choice is better. It costs nothing on the X-E1 frame (38.58 without it against 38.56 with it), but the sheet loses 3.3 dB. The median stays.

## Using it

It is the default for X-Trans files whenever numpy is installed: `shootflow develop DSCF0001.RAF --dcp FOLDER`. In code, `directional(..., clamp=False, select="homogeneity")` reproduces yesterday's numbers exactly, so the comparison can be rerun. The raw rows and the method are in the venture's [evaluation note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/xtrans-clamp-gradient-2026-11-15.md).

The lesson for the next step is the same as today's: before tuning a step, check that it does anything at all. Here, the step that gave the method its name didn't.
