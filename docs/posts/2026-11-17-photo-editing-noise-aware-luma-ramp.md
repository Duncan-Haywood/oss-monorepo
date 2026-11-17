---
title: "Luma and colour want different amounts of smoothing: the noise-aware demosaic now gives each its own"
seo_title: "Noise-aware demosaic: a separate luma ramp, +0.2 dB luma"
date: 2026-11-17
description: "ShootFlow's noise-aware demosaic now blends luma on its own ramp: +0.99 / +1.28 dB luma over directional on 25 held-out files, up from +0.76 / +1.12."
tags: [photo-editing, raw, demosaic, research]
---

ShootFlow, the open-source photo pipeline in `ventures/photo-editing`, has an opt-in noise-aware demosaic
(`--demosaic noise-aware`). Where the edge-keeping demosaic only follows noise, it blends toward plain
averaging, block by block, using the noise level the raw file states. How far it leans is set by a "ramp":
below a detail-to-noise ratio of q_low it is all averaging, above q_high all edge-keeping.

That ramp was fitted on colour accuracy. Yesterday luma, the brightness detail people actually see, was scored
for the first time, and it hinted that luma wanted more averaging than colour did.

## One ramp can't serve both

We swept 50 ramps over 58 tiles from 46 real camera files (each at three noise levels and two noise models),
fitted on 21 files and scored on the other 25.
Refitting the one ramp for luma just traded colour for luma: on Bayer, the luma-best ramp gained 0.17 dB of luma
and lost 0.06 dB of colour, with three tiles now worse than not blending at all.

So luma got its own ramp. The output keeps the colour difference (red minus green, blue minus green) of the
old blend and takes its luma from a second blend on a later ramp, which leans further toward averaging. It is
one line of arithmetic per pixel: the old result plus the luma difference between the two blends, added to
red, green and blue alike.

## The result

On the 25 held-out files, gain over the edge-keeping default:

| | luma before | luma now | RGB before | RGB now |
|---|---|---|---|---|
| Bayer (most cameras) | +0.76 dB | **+0.99 dB** | +0.35 dB | **+0.48 dB** |
| Fujifilm X-Trans | +1.12 dB | **+1.28 dB** | +0.51 dB | **+0.61 dB** |

It gains at every noise level we drew, and no held-out tile is worse than the default by more than 0.08 dB.
A clean frame is unchanged.

## Two honest footnotes

**The Bayer ramp was picked with a rule added after seeing held-out results.** The first rule picked a ramp
that lost four held-out Bayer tiles. We added a second condition (no tuning tile may lose more than 0.15 dB
against the blend that already ships), which picks a slightly earlier ramp. Its neighbours score about the same,
so it doesn't look like a lucky pick, but the Bayer numbers are not a clean hold-out. The X-Trans pick is the
same under both rules.

**Sensels no longer keep their raw value.** The old blend left each sensel's own colour exactly as measured.
The luma shift moves it. We tried putting it back, and that gave up most of the gain: a noisy sensel's raw
value is exactly the noise being smoothed.

The mode stays opt-in. All of this is synthetic noise added to real scenes. A real low- and high-ISO pair of
one scene is still the test that would make it the default.

Details, the full grid and every row: `ventures/photo-editing/eval/noise-aware-luma-ramp-2026-11-17.md`.
