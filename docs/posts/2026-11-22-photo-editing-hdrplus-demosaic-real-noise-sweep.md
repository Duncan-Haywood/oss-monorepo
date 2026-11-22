---
title: "A demosaic tested on real sensor noise: 48 phone bursts, and a winner that missed one bar"
seo_title: "Testing a noise-aware demosaic on real phone burst noise"
date: 2026-11-22
tags: [photo-editing, raw, demosaic, noise, evaluation, open-data]
description: "Real sensor noise from 48 HDR+ phone bursts as a demosaic test: one noise read gains 0.13 dB, but two bursts lose, so the default stays."
---

ShootFlow's raw developer blends two demosaics: an edge-following one where the
picture has detail, and a plain bilinear one where the edge-follower would only
be sharpening noise. To decide where each goes it needs a noise model. Files
without one get a model read from the picture itself, and there are several ways
to do that read.

Earlier today we found a way to measure those reads against real noise. Google's
public HDR+ dataset holds, for each burst, the raw reference frame and the burst
merged onto it. The reference minus the merge is that frame's own sensor noise,
with the scene taken out. On 57 bursts the read we had liked best on synthetic
noise, `mpcws`, came out reading too high.

Reading too high is not automatically bad. The developer scales every frame read
down by 0.8 on purpose, so a read that starts high can end up nearest the truth.
The question that matters is image quality, so this run turned the bursts into a
demosaic test.

## Building the test from real noise

- **Clean scene:** the merge, fitted to the reference cell by cell (lens shading,
  exposure) and binned 4 x 4, the same binning our other demosaic tests use.
- **Noise:** at every site of the binned mosaic, the reference's own leftover at
  a sensel of the same colour in that block, rescaled to the scene's level with
  the burst's own measured noise model. Its quantisation steps, hot pixels and
  spatial pattern are the sensor's, not ours.
- **Masking:** where the merge rejected a moving subject the leftover is scene,
  not noise, so those sites are left out of the score. Five bursts had more than a
  quarter of the frame moving and were skipped.

The questions and their pass bars were written and committed before the 53 test
bursts were scored. Four other bursts were used to build the tool and are not in
the result.

## What 48 bursts said

Gain over plain directional demosaicing, mean over 48 bursts:

| noise model | luma | colour |
|---|---|---|
| the true noise (an oracle) | +0.75 dB | +0.24 dB |
| what ships (`mpcw`) | +0.56 dB | +0.26 dB |
| `mpcws` | +0.69 dB | +0.30 dB |
| the phone's own NoiseProfile | +0.72 dB | +0.13 dB |

No burst loses to plain directional with the frame reads. Against what ships,
`mpcws` gains +0.13 dB luma and +0.04 dB colour, and the gain grows with noise:
+0.06, +0.12 and +0.22 dB luma from the quietest third of bursts to the noisiest.
It closes about 70% of the luma gap to the oracle.

It passed three of the four tests. The fourth said no burst may lose more than
0.1 dB to what ships, and two did: one Pixel XL frame by 0.16 dB on colour, another
by 0.19 dB on luma. So the default does not change.

## Why we kept the bar anyway

On both of those bursts the oracle, a model that knows the true noise, loses by
just as much. A read closer to the truth costs on those frames whichever read it
is. That points away from `mpcws` and toward the blend: the ramps that turn
"detail compared with noise" into a blend weight were tuned on synthetic noise.
The oracle loses more than 0.1 dB to what ships on 9 of the 48 bursts.

We could have argued the two losses away. We didn't: a rule that bends after the
data comes in isn't a rule. The next test is a ramp fit on real noise, split by
burst, and then the same four questions for `mpcws` again.

One more reading: the phones' own NoiseProfiles, used the way the developer uses
them for any DNG that has one, gain luma (+0.16 dB) but lose colour (-0.13 dB)
against the frame read, and lose more than 0.1 dB of colour on 22 of 48 bursts.
That is the next thing to look at for DNGs.

## Limits

One maker's phones, 10-bit frames, mostly daylight. The clean scene still holds
about a fifth of the input's noise, because a merge never averages all of it away.
Nothing here covers Fujifilm's X-Trans sensors or a large-sensor camera's
14-bit files.

The tool, the rows and every number are in the repository:
`ventures/photo-editing/tools/hdrplus_demosaic_sweep.py` and
`ventures/photo-editing/eval/hdrplus-demosaic-sweep-2026-11-22.md`. The HDR+ data
is CC BY-SA 4.0 (Hasinoff et al., SIGGRAPH Asia 2016).
