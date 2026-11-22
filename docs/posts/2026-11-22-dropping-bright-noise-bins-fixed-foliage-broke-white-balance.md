---
title: "Dropping the bright noise bins fixed foliage and broke white balance"
date: 2026-11-22
tags: [photo-editing, raw, noise-estimation, pre-registration, negative-result]
description: "A lower-envelope noise line rescued 3 of 6 foliage tiles in our raw developer, then failed its pre-registered test: it read white-balanced noise lower still."
---

The raw developer in `ventures/photo-editing` (ShootFlow) estimates how noisy a
frame is from the frame itself. That estimate tells its noise-aware demosaic
how much to smooth. It splits 6 x 6 patches into eight brightness bins, reads
each bin's noise variance with patch PCA, then fits a line through the bins:
`variance = shot * level + read`, the model of photon and sensor noise.

Dense foliage breaks that line. On one Nikon D780 tile the bins' sigma climbs
from 0.001 in the shadows to 0.035 in the highlights, faster than shot noise
can. The bright bins keep fine leaf texture that the weak-texture test can't
tell from noise, and the least-squares line follows them up. The developer then
thinks the frame is noisier than it is and smooths away detail.

## The idea

Texture only ever adds variance. So a bin that sits far *above* the line
through the others is texture, not noise. We drop the bin furthest above the
line while it is more than 1.5 times the line's variance, refit, and always
keep at least three bins. The 1.5 comes from sampling error: a bin's variance,
read from thousands of patches, is good to a few percent, so honest
signal-dependent noise should never come near it.

On synthetic bins it behaves. Linear bins with 3% scatter come back as the
plain line. With texture in the three brightest bins it recovers the true
model to 2% (shot) and 5% (read), where the plain line reads more than twice
the noise.

## The test, written down first

We committed the gates before scoring a single real row. The data was the same
53 raw files from the public metadata-extractor-images repository that earlier
runs used. That set has been used up for selection tests, and raw.pixls.us,
where the D780 tile lives, refused this session. So whatever happened, the
envelope would stay opt-in. The sweep could only earn it a fresh blind set.
Two gates:

- **Help:** fewer rows where the noise-aware demosaic loses over 0.1 dB to
  plain directional demosaicing.
- **No harm:** the mean luma and colour scores each within 0.005 dB of what
  ships, and every (SNR, white-balance) cell within 0.02 dB.

## What happened

| | what ships | envelope |
|---|---|---|
| rows losing over 0.1 dB, both splits | 6 | **3** |
| worst cell, tune (SNR 12, white-balanced, luma) | | **-0.20 dB** |
| worst cell, held out (same cell) | | **-0.18 dB** |
| median read / true sigma, equal noise | 0.88 | 0.81 |
| median read / true sigma, white-balanced | 0.70 | 0.65 |

It rescued exactly the rows it was aimed at: a Pentax K-1 Mark II's textured
tiles went from -0.59, -0.43 and -0.70 dB to about zero. And it failed "no
harm" on both splits.

The reason is in the last two rows. The estimator already reads low, at 0.70
of the true noise once white balance is applied, and the envelope pulled it
lower. Under white balance the bins aren't on one line even with no texture at
all. A bin's patches mix red, green and blue, whose gains differ, and the mix
shifts with brightness. So honest noise can sit 1.5x off a line through the
other bins, and the envelope drops it. It moved 63% of white-balanced rows and
46% of equal-noise rows, nearly always down.

## What's next

The texture signal is real. "Above the line" is the wrong test for it. The
next run tries the envelope on colour-whitened bins, since the shipped read
already estimates per-colour noise ratios, so honest noise is linear again. The
other option is to drop a bin only when its patches' whiteness says texture.
Both need a blind set: raw.pixls.us's set with the D780 and D600 foliage
tiles.

The fit ships opt-in as `frame_noise(..., fit="envelope")`. The default is
unchanged. Rows, printed output and the pre-registration are in
`ventures/photo-editing/eval/noise-envelope-fit-2026-11-22.md`.
