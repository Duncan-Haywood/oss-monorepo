---
title: "Which photos want a softer demosaic? Parts of every photo, if you know the sensor's noise"
seo_title: "Noise-aware demosaic: per-region blending beats a per-frame choice"
date: 2026-11-16
description: "A per-block blend beats any one choice per photo: +0.3-0.4 dB held out and never worse, when the DNG states its noise. Estimated noise can lose 5 dB."
tags: [photo-editing, raw, demosaic, research]
---

ShootFlow, the open-source photo pipeline in `ventures/photo-editing`, turns a camera's colour mosaic
into a full-colour image with a directional demosaic. It builds green along edges, not across them.
On held-out frames that beats LibRaw's methods on most scenes. One frame broke the pattern this
morning: a smooth Sony A7 IV scene, where plain bilinear averaging came out ahead once noise was added.
Edge-keeping follows each pixel's own noise along a line. Bilinear averages it away. On a scene with
little fine detail, that averaging wins.

So the open question was: can you tell from the raw alone which frames want the softer method?

## The test

We took every raw file in a public sample set that LibRaw reads: 46 files from 41 cameras. We rendered
and binned each one into a clean "truth" image and cut up to three tiles from it. Each tile was turned
back into a mosaic (Fujifilm X-Trans, and separately ordinary Bayer), and noise was added at four levels.
Then we demosaiced each tile both ways and scored every blend between the two. Rules were fitted on 21
files and scored on the other 25.

## What we found

**A per-frame choice is the wrong size.** Even with the truth in hand, the best single blend per tile
gains only +0.41 dB (X-Trans) and +0.26 dB (Bayer) on average. A rule that must guess the weight from the
mosaic does worse than that ceiling. With the noise known it gains +0.22 dB, but some frames lose up to
2.6 dB.

**A per-block blend beats the ceiling.** We split the image into 24 x 24 blocks. Each block gets its own
weight, from how much the directional result differs from bilinear there compared with the noise
expected at that brightness. That gains **+0.43 dB on X-Trans and +0.31 dB on Bayer**, and +0.93 / +0.68
dB at the noisiest level. Not one of 124 held-out tile and noise cases got worse by more than 0.01 dB.
Smooth sky and an edge in the same frame want different methods, and a frame-level switch can only
pick one.

**But only if the noise is known.** When the noise level was estimated from the image itself, detailed
scenes broke it. A frame full of fine texture has no quiet patch to measure noise in, so the texture
reads as noise, and the blend smears detail it should keep. One frame lost 4.5 dB. No tuning fixed that.

## Where the noise comes from

DNG files can carry a `NoiseProfile` tag: the sensor's shot and read noise at the ISO the photo was
taken at. Phones write it. So does Adobe's converter. The only sample file with one, an LG Nexus 5X
frame, states noise about 20% above what we measure in the frame itself. That agrees on scale, and an
overstatement that size is inside the range we found safe.

So ShootFlow now has `--demosaic noise-aware`. It reads the file's NoiseProfile and blends block by block.
A file without one develops as before, with a note saying so. It costs 4.4 s against 2.0 s on a 12 MP
phone frame.

## Why it is not the default yet

- An overstated profile hurts. At about 1.5 times the true noise, the blend starts to smear detail
  (up to 1.7 dB lost at the far end of our grid). Understating is harmless.
- We have checked one real profile.
- The noise here was synthetic, and the score was colour PSNR only.

The next step is to compare each file's profile with the noise measured in the frame and refuse one that
reads far too high. With that check, the mode could become the default for every DNG that carries a
profile.

The data, the tool and every number are in the repository: `eval/xtrans-noise-aware-blend-2026-11-16.md`.
