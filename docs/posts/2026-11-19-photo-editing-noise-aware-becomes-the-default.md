---
title: "A raw developer's noise-aware demosaic becomes the default, on a rule written before the cost was measured"
seo_title: "Noise-aware demosaic becomes the default in ShootFlow"
date: 2026-11-19
tags: [photo-editing, raw, demosaic, evaluation]
description: "ShootFlow's --demosaic auto now picks noise-aware: 1.34x directional's time and the same memory on 53 real raws, ahead on average at every noise level."
---

ShootFlow's raw developer has had a `noise-aware` demosaic since 2026-11-16. It runs the directional demosaic
and a plain bilinear one, then blends block by block. Where the directional result differs from bilinear by
less than the sensor's own noise at that brightness, the extra "detail" is mostly noise, so the block leans
toward bilinear. It is the same idea a careful retoucher uses by hand: don't sharpen noise.

It stayed opt-in for one reason. On 2026-11-17 it took 5.8 times as long as the directional default and up to
6.4 GB on a 36-megapixel file. A default that slow is a regression for someone culling a card. Six changes since
then moved its work into C and cut its memory. Each was checked to give the same output bytes as before. The
open question was whether that was now enough
([full note](../../ventures/photo-editing/eval/auto-noise-aware-2026-11-19.md)).

## The rule came first

Before timing anything, the run committed a five-part test. Three parts summarise quality rows earlier runs had
already scored: 6,008 rows from three sweeps over raw.pixls.us scenes, with noise added at four levels. Two parts
set cost limits: median time at most 1.5 times directional's, and median added memory at most 1.5 times
directional's, with no file over 2 times. If any part failed, the default would stay.

## What it measured

On the 53 public sample raws that open (49 bodies, all six Bayer phases and both X-Trans layouts):

- **Time:** 1.34 times directional's, a median 0.062 seconds more per megapixel. On a 36 MP Nikon D810 that is
  8.0 s against 6.5 s.
- **Memory:** 1.015 times directional's added peak, none over 1.21 times. On the two Fujifilm X-Trans files it
  is 22% lower.
- **Quality, from the earlier rows:** ahead of directional on average in all 24 combinations of sweep, noise level
  and white-balance scenario. The gain is about +1 dB luma at the noisiest level and +0.1 to +0.2 dB near clean.
  0.78% of rows lose more than 0.1 dB, and the worst loses 0.58 dB.

All five parts passed. One caveat is in the note: "1% of rows" was not written as pooled or per sweep. Pooled it
is 0.78%. The first sweep alone is 1.42%.

## A crash on the way

Switching the default and running the test suite gave 27 failures. Four were tests that pinned the old default.
The other 23 were one bug. A frame under 24 pixels in one direction but wider in the other was cut into blocks
that could not be reshaped, so `--demosaic noise-aware` crashed on it. No camera writes a frame that thin, but
crops and small test frames are. It is one block now, as the C path already treated it.

## What is still open

The near-clean losses come from the blend itself, not from reading the noise wrong. On the worst tile the
true noise model loses just as much. A gate in the blend's ramps is the next step. The quality rows also use added
noise on real scenes, not a real high-ISO frame against a clean one of the same scene. `--demosaic directional`
keeps the old default and its exact bytes for anyone who wants them.
