---
title: "The noise-aware demosaic helps luma more than colour, and its guard now reads each colour on its own"
seo_title: "Noise-aware demosaic: luma scored, per-plane NoiseProfile guard"
date: 2026-11-16
description: "Scored on luma, ShootFlow's noise-aware demosaic gains 0.6-1.8 dB, no tile worse. Its NoiseProfile check now reads each colour plane against its own sensels."
tags: [photo-editing, raw, dng, demosaic, research]
---

ShootFlow, the open-source photo pipeline in `ventures/photo-editing`, has an opt-in noise-aware demosaic
(`--demosaic noise-aware`). In flat regions, where edge-keeping only follows noise, it blends the edge-keeping
result toward plain averaging. Where there is detail, it keeps the edges. It learns how noisy the sensor is
from the DNG's NoiseProfile tag, and since earlier today it checks that tag against the frame, because half
of real profiles overstate the noise.

Two questions were still open. The blend had only been scored on colour accuracy, never on luma, the
brightness detail people actually look at. And every test had drawn its noise after white balance, the same
on every colour, which is not how a sensor works.

## Luma: the bigger win

On 25 held-out sample files (real scenes from 41 camera bodies, noise added at three levels), the blend
raises luma PSNR over the directional default by **+0.61 dB on ordinary Bayer sensors and +0.92 dB on
Fujifilm's X-Trans**. That is more than its colour gain. No tile, in 522 per layout, is worse in luma by more
than 0.01 dB. At the noisiest level the gain is up to +2.7 dB on X-Trans.

## Noise the way a sensor makes it

A sensor's noise is set before white balance. Red and blue are then multiplied by their gains, typically 1.1x
to 3x on the files we used, so on the image the demosaic sees, red and blue are noisier than green by that
factor. Drawn that way, the blend's luma gain grows to +0.91 / +1.31 dB.

The profile check did not hold up as well. It carried the profile to the image with one average gain and
compared it with all colours mixed together. Under realistic noise it read an honest profile as high as 1.55x
and trimmed honest profiles on up to 33 of 174 tiles. A needless trim cost up to 0.68 dB of luma on a tile.

So the check now takes each colour plane separately: that plane's profile, carried by its own gain, against
that plane's own sensels. Honest profiles read at most 1.03x at the 95th percentile in every case we drew, and
a needless trim costs at most 0.12 dB. A profile that overstates only one plane is now scaled on that plane
alone. The tests overstate blue 8x, and the check names blue at 8x and leaves red and green alone.

## What real files do

We reran the check on 24 real DNGs from raw.pixls.us. They include all ten we know of that write a separate
profile for each plane (six Google Pixels, a Lightroom D80, two Xiaomis, an asus). On real files the per-plane
reading mostly agrees with the old one. Where a profile overstates, as on Huawei, LG, OnePlus, Motorola and
the Pixel 7 and 8 Pro, it overstates all three planes alike. The one file that differs is a Pixel 4 XL, whose
green plane reads 1.34x while red and blue read honest.

## What did not ship

Feeding the blend a separate noise model per colour, not just the check, was measured and left out. It gained
0.01-0.05 dB of colour and lost 0.05-0.07 dB of luma against the simpler model the blend was tuned with. That
hints that luma wants a little more averaging than the colour-tuned settings give, which is the next thing to
fit.

The mode stays opt-in. Every score here uses synthetic noise on real scenes. The check that would make it the
default is a real low- and high-ISO pair of the same static scene.

The full write-up, with tables per scenario and per file, is in
`ventures/photo-editing/eval/noise-aware-planes-luma-2026-11-16.md`.
