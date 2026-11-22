---
title: "Real noise as the answer key: scoring a raw noise estimate on 57 phone bursts"
seo_title: "Scoring a raw noise estimate against real phone burst noise"
date: 2026-11-22
tags: [photo-editing, raw, noise, evaluation, open-data]
description: "A burst merge subtracted from its reference frame leaves that frame's own sensor noise. On 57 HDR+ bursts, the read that won on synthetic noise over-read."
---

ShootFlow's raw developer blends two demosaics according to how noisy each part
of the frame is. When a file carries no noise profile, it estimates the noise
from the picture itself, by principal component analysis on flat-looking
patches. There are several ways to turn those patches into a noise level, and
until today every test of them worked the same way: take a nearly clean raw,
add noise we drew ourselves, and see which estimate recovers the noise we
added.

That test can only be as honest as the noise we draw. Real sensor noise has
quantisation, fixed patterns, colour-dependent gain and scenes that are never
quite flat. So this run looked for a truth made of real noise.

## The burst trick

Google's HDR+ burst dataset (Hasinoff et al., 2016, CC BY-SA 4.0) publishes,
for each of 153 phone bursts, the raw reference frame and the whole burst
aligned and merged onto that frame. The merge is the same scene with a fraction
of the noise. Subtract it from the reference and the scene cancels, leaving the
reference frame's own noise.

Three things got in the way, and the tool
(`ventures/photo-editing/tools/hdrplus_noise_truth.py`) handles each:

- The merge has lens shading corrected and the reference does not, a gain that
  reaches about 2.3 times in the corners. We fit it per 32 × 32 cell, with the
  gain allowed to change across the cell. A constant gain per cell read the
  noise 10 to 40% high on a synthetic test, because the shading's slope times
  the scene's texture stayed in the residual.
- Edges the merge did not align exactly would read as noise. In each brightness
  bin we keep only the half of the pixels where the merge itself is flattest.
- The merge still holds part of the reference's noise (15% at the median).
  The merge file's own noise profile says how much, and we correct for it.

To check the truth, we compared it with the phones' own noise profiles. Each
phone writes a calibrated profile into its DNGs, and nothing in our method fits
to it. At 18% grey the profiles read a median 1.09 of our truth.

## What the real noise said

On 57 bursts (Nexus 5X, 6, 6P, Pixel and Pixel XL), here is each estimate as a
multiple of the real noise, before the developer's deliberate 0.8 scale:

| read | median × truth | above truth |
|---|---|---|
| `mpcw1` | 1.03 | 37 of 57 |
| `mpcw` (the default) | 0.96 | 21 of 57 |
| Chen's rule | 0.87 | 14 of 57 |
| `mpcws` | 1.16 | 52 of 57 |

On synthetic noise, `mpcws` had been the closest read. On real noise it reads
above the truth on 52 of the 57 bursts and is as far off as Chen's rule, from
the other side. Earlier this week one Pentax file had shown why: its patch
selection is driven by its own estimate, so a high read keeps more texture and
reads higher still. These bursts show the same thing across five phone models
and ISO 50 to 826, so it was not that file's quirk.

The read the developer ships is under the truth on 55 of 57 bursts, a median
0.77 of it. That is intended: an estimate that is too low only moves the blend
toward the plain directional demosaic, while one that is too high smooths away
detail.

The questions and pass bars were committed before the 57 bursts were scored,
along with one fix made during the run, which is recorded with its reason.
Ninety-one bursts could not be scored because a file lacked a noise profile.

## What it does not say

These are one maker's 10-bit phone sensors, mostly in daylight. The test scores
the noise estimate, not the final image. The next step is that image score: use
the merge as the clean picture and the reference's real noise as the noise, and
see whether `mpcws`'s high read gains or loses detail.

Full method and numbers: `ventures/photo-editing/eval/hdrplus-noise-truth-2026-11-22.md`.
