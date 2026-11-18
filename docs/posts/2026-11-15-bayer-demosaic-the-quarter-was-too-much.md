---
title: "A 1997 demosaic formula cost our sharpest photos a decibel of detail. We changed one number"
seo_title: "Bayer demosaic: why the Hamilton-Adams quarter was too much"
date: 2026-11-15
tags: [photography, raw, demosaic, bayer, libraw, open-source, photo-editing]
description: "ShootFlow's Bayer demosaic lost luma to plain bilinear on fine, aliased texture. A smaller Laplacian weight closes most of it and lifts colour on every test."
---

Earlier today we gave ShootFlow, the open-source photo workflow in this repository, a directional
demosaic for Bayer sensors ([the first post](2026-11-15-bayer-demosaic-against-libraws-seven.md)).
It beat bilinear interpolation on colour everywhere, but it had one embarrassing loss. On the two
test frames with the finest texture, a Sony A7 III and a Pentax K-1 Mark II (which has no
anti-aliasing filter), its brightness detail (luma) was 0.8 to 1 dB *worse* than the soft bilinear
method it replaced.

## Where the error came from

At a red or blue sensel the demosaic has to guess green. The classic Hamilton-Adams guess (1997)
takes the two neighbouring greens' mean and adds a quarter of the sensel's own "second difference":
how much brighter it is than the same-coloured sensels two steps away. That quarter is exactly right
if green minus red changes linearly across those five sensels. On fine, aliased texture it does not,
and the quarter pushes too much of the red sensel's own detail into green.

A plain Taylor expansion of a smooth green gives a different answer: an eighth. So the two textbook
values bracket the truth, and which one is right depends on the picture.

## What we did

We made the weight a parameter and swept it on the three *tuning* pictures only (a Canon 70D frame,
a Nikon D810 frame and a synthetic zone-plate sheet). The sum peaked between 0.16 and 0.19. We took
3/16 and then ran the three *held-out* frames once:

| frame | luma before | luma now | the best other method |
|---|---|---|---|
| Sony A7 III | 40.64 dB | 41.55 dB | DCB 41.72, bilinear 41.63 |
| Olympus E-M10 | 45.15 dB | 45.80 dB | AAHD 45.32 |
| Pentax K-1 II | 34.03 dB | 34.63 dB | VNG 34.80 |

The luma gap shrinks from about a decibel to under 0.2 dB. Colour accuracy rose on all six test
pictures, by 0.10 to 4.28 dB. That puts ShootFlow's Bayer demosaic first on colour against all
seven of LibRaw's methods and bilinear, on every picture we have. On the synthetic sheet, false colour
dropped from 119 to 42. The same change in the C path is still bit-for-bit equal to the numpy
reference, and speed is unchanged.

## What did not work

Clamping each green between its two neighbours helped the A7 III a lot (+1.6 dB luma), but it cost
the D810 1.2 dB and the sheet 4 dB, so we left it out. That trick works on Fujifilm's X-Trans sensor.
A third, direction-free estimate where the two directions tie did nothing on most frames and hurt
the Olympus. An eighth would close the A7 III and K-1 II gaps completely, but costs the cleaner
frames up to 1 dB.

That last point suggests the next step: choose the weight per pixel, from how far the local colour
difference strays from a straight line. Under heavy noise, bilinear still keeps more luma on real
frames, because its 3x3 average also smooths noise. Settling that needs a real low/high-ISO pair.

Every number here is from `tools/bayer_demosaic_check.py` on public sample files. The 350 raw rows
and the full write-up are in `ventures/photo-editing/eval/bayer-laplace-weight-2026-11-15.md`.
