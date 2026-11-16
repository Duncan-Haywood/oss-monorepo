---
title: "Letting each pixel choose its demosaic weight: a small win, a loss, and a clean check"
seo_title: "Per-pixel Laplacian weight in a Bayer demosaic, tested on 5 fresh raws"
date: 2026-11-16
description: "A per-pixel weight helped false colour and four of five fresh raw files but hurt the finest frames, so it is an option. Our default beat LibRaw on all five."
tags: [photo-editing, raw, demosaic, research]
---

ShootFlow is the open-source photo pipeline in `ventures/photo-editing`. Its Bayer demosaic builds the missing green at each red or blue pixel from the two neighbouring greens, plus a fraction of the pixel's own second difference. Yesterday's run set that fraction to 3/16 for the whole frame: smooth, clean frames wanted a quarter, and fine, aliased frames wanted an eighth. The obvious next step was to let each pixel choose.

## What we tried

If the colour difference (green minus red, or green minus blue) changes linearly across a few pixels, a quarter is exactly right. So for each pixel we picked the weight that makes the local colour difference *closest to linear*. That is a least-squares fit over a 3 x 3 window, clipped to between an eighth and a quarter. We tuned it on three images (a Canon 70D, a Nikon D810 and a synthetic test sheet). The combined colour score rose 0.84 dB.

## What it did on images it had not seen

On the three held-out frames from yesterday, it went the wrong way on the two that mattered most. On the Sony A7 III, luma fell 0.33 dB, and on the Pentax K-1 II it fell 0.24 dB. Those are the two fine, aliased frames the idea was meant to help. On fine texture, aliasing makes the colour difference *look* as if it wants more of the pixel's own detail, when it wants less.

We then looked for any local measurement that would pick between an eighth and a quarter correctly. Choosing perfectly per pixel would cut the green error by 17 to 49%, so the gain is there to win. But none of the four measures we tried ranked the choice with the same sign on every frame. On real frames, none got a rank correlation above 0.16.

## A fresh test set

Yesterday's held-out frames had already been used once, so we took five more raw files from the same public sample set: a Sony A7 IV, Nikon D800E, Canon 7D, Panasonic GF7 and Samsung NX1. No earlier run had used them. On these five, the per-pixel weight added 0.10 dB of colour accuracy on average and did better on four of the five. On the synthetic sheet, the worst false colour fell from 42 to 9.6 (thousandths of full scale). Against that, it takes about twice as long and has no fast C version. So it ships as an option, `laplace="adaptive"`, and the default stays 3/16.

The more useful number is about the default itself. On five frames it was never tuned on, ShootFlow's directional demosaic beat every one of LibRaw's seven Bayer methods on colour accuracy, on all five frames: by 0.5 to 1.5 dB without noise and 0.2 to 1.1 dB with heavy added noise. It also had less false colour than any of them. LibRaw is the library most open-source raw developers use.

## Caveats

The "truth" is each camera's own frame rendered by LibRaw and binned 4 x 4, so these are real scenes with known answers, but not photographs of a test chart. The noise is synthetic. The full tables and the commands are in `ventures/photo-editing/eval/bayer-adaptive-laplace-2026-11-16.md`.

The next step is probably a small learned selector, trained on many binned frames, with these ten frames kept back as the test set.
