---
title: "Four even terms are not enough for one lens in six"
seo_title: "DNG WarpRectilinear2 vs WarpRectilinear on 5,440 lensfun lens profiles"
date: 2026-11-12
tags: [photo-editing, ventures, raw, dng, lens-correction]
description: "ShootFlow now runs the DNG 1.6 WarpRectilinear2 opcode. On lensfun's 5,440 real lens profiles, the older opcode can't get within a pixel on about 17% of them."
---

[ShootFlow](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/photo-editing) develops raw photos on your own machine. A DNG file can carry its own lens correction as a warp opcode, and since this morning ShootFlow applies the original one, `WarpRectilinear`. Checked against a Leica T's own preview, it came out within 0.18 px. DNG 1.6 added a second warp, `WarpRectilinear2`, and until today ShootFlow listed it as "not applied".

## What changed in the opcode

We read the layout from the DNG 1.7.1 specification (pages 120 to 122) rather than from memory. The old opcode bends the image by a radial factor with four terms, all even powers of the distance from the centre: `kr0 + kr1 r² + kr2 r⁴ + kr3 r⁶`. The new one has fifteen terms on every power up to `r¹⁴`, odd ones included. It can divide by the polynomial instead of multiplying, and it can clamp the radius to a range where the model is valid. A writer can also put an optional `WarpRectilinear2` first, then an old-style warp as a fallback for older readers. A reader that applies the first one skips the fallback. ShootFlow now does all of this. The numpy engine and the pure-Python engine give byte-identical output, and 21 new tests check the formula and the specification's own three skip-rule examples.

## Does the extra flexibility matter?

No camera file using this opcode has turned up yet, so we couldn't check our output against Adobe's. We could ask a different question: do real lenses need odd terms?

[Lensfun](https://lensfun.github.io/) is the open lens database behind darktable, RawTherapee and Hugin. It stores 5,440 distortion calibrations for 1,079 lenses in Hugin's "ptlens" model, `r_d = r_u (a r³ + b r² + c r + 1 − a − b − c)`. That model has a cubic and a linear term, both odd. 4,741 of the calibrations use at least one of them. Rescaled so that r = 1 sits at the frame's farthest pixel instead of half its height, the model drops straight into `WarpRectilinear2`'s first four terms. Our check against lensfun's own formula agreed to 0.000000000002 px.

The old opcode can only approximate these profiles. For each profile we fitted its four even terms over a 6,000 px wide frame and measured the largest shift left over:

| Rectilinear lens profiles (5,411) | Plain least-squares fit | Best fit for the worst pixel |
|---|---|---|
| median leftover | 1.06 px | 0.30 px |
| over 1 px | 52% | 17% |
| over 2 px | 33% | 5.5% |
| worst | 51 px | 14 px |

The right-hand column is the fairest picture of the old opcode, because each fit there is chosen to make the worst pixel as small as possible. Even so, about one profile in six still leaves more than a pixel somewhere in a 24 MP frame. A converter that fits the obvious way, by least squares, misses by more than a pixel on half of them. The largest leftovers belong to wide zooms and action cameras: a GoPro Hero3+ profile, a Pentax 16-50mm at 28 mm, a 1 Nikkor 10-30mm.

## What this doesn't tell you

It doesn't say lensfun's profiles are right to a pixel. They are fitted too, and the corners of a frame are where any fit has the least data. It also says nothing about Adobe's own lens profiles, which aren't public. What it does show is that the precision `WarpRectilinear2` adds is real, and a reader that ignores it gives up that precision on a meaningful share of real lenses.

## Next

The same arithmetic points to the next feature. Many raw files carry no correction at all. Lensfun profiles turn into an exact `WarpRectilinear2`, so ShootFlow could pick the profile by the file's lens and focal length and apply it. We also found a gap in passing. ShootFlow skips any opcode flagged "preview quality" even in a full develop, but the specification says a full-quality develop still needs those opcodes. That fix is next on the list.

The measurement script is `tools/lensfun_warp_fit.py`, and the full numbers are in `eval/warp-rectilinear2-2026-11-12.md`. Both are MIT licensed. The script fetches lensfun's data at run time and doesn't copy any of it into the repository.
