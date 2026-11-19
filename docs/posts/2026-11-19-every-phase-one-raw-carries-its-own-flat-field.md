---
title: "Every Phase One raw carries its own flat field: applying it matches LibRaw to 3 codes on ten backs"
seo_title: "Phase One IIQ sensor calibration, decoded and checked"
date: 2026-11-19
description: "IIQ files hold a factory calibration: flat fields, defect maps, tile curves. ShootFlow now applies it; outside dead columns it matches LibRaw within 3 codes."
tags: [photo-editing, raw, phase-one, evaluation]
---

Yesterday [ShootFlow](https://marisstella.app/photo-editing/) learned to read
Phase One's IIQ raws, and every decoded sensel matched LibRaw's. One number
in that write-up was off: the P45+'s colour levels were 2.2% away from
LibRaw's render, while nine other backs were within 0.7%. The reader note
gave the likely reason. LibRaw applies a calibration from the file that
ShootFlow did not.

Today ShootFlow applies it too. This post covers what the calibration is,
how much it moves a picture, and how the result was checked.

## What a Phase One raw carries

Each IIQ has a block (sensor tag `0x110`) that Capture One reads and most
people never see. On the ten backs checked here it holds:

- a **defect map**: 376 to 19,072 single sensels and up to 17 whole columns
  to fill in;
- **flat fields**: gain grids per colour, and on the tiled IQ sensors one
  grid per tile plus strips one sensel wide along the seams;
- a **polynomial for the right half** of the split-readout CCDs (P30, P45+),
  adjusted for the sensor temperature recorded in the file;
- **per-quadrant gains and curves** for the four-quadrant backs (P65+,
  IQ140, IQ180).

The sizes surprised me. LibRaw's calibration changes the P45+ by between
0.94x and 1.06x across the frame: the right half is about 4% darker, with
falloff toward the corners. On the IQ180 the four tiles sit up to 11%
apart. Leave that out and a frame of a white wall shows a seam down the
middle.

## The check

LibRaw applies the calibration while it renders, not to the raw values it
exposes. So the check renders each file in LibRaw with bilinear
demosaicing, the camera's own colour space, unit white balance and linear
16-bit output. Bilinear demosaicing only fills in each sensel's two missing
colours, so the sensel's own channel is LibRaw's calibrated value, scaled.
That gives a reference for every sensel.

Across 387 M sensels on ten backs:

| | sensels equal to LibRaw | within 1% |
|---|---|---|
| before | 0.006-2.1% | 1.7-96% |
| after, dead columns left out | 99.88-100% | 100% |

Five backs (H 25, P20+, P25, P25+, IQ150) now equal LibRaw on every sensel
outside the dead columns. The other five are within 3 of 65,535 levels: the
remainder is float rounding in the curve tables. The P45+'s channel levels
went from 2.2% off to 0.02%.

## The one place it differs, on purpose

The dead columns. LibRaw fills each sensel in a dead column from whichever
direction looks smoothest. Fitting LibRaw's values as a fixed mix of
neighbours leaves a 2% residual, so its fill is not a fixed filter.
ShootFlow uses fixed weights from the same-colour neighbours instead. To
see whether that is worse, I blanked 300 good columns per frame on four
backs and refilled them. The fixed fill, a plain left-right mean, a
smallest-difference direction pick and a gradient-weighted mix all came
within 0.002 of each other in error. Picking a direction did not help on
real frames, so the simpler fill stays, and the check reports its numbers
with and without those columns.

## What it costs

0.15 to 0.8 s a frame with the small C helper, on top of a decode that
already takes about a second for 100 MP. The calibration is on by default,
`calibrate=False` turns it off, and the develop report lists what was
applied.

The whole table and the method are in
[the eval note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/photo-editing/eval/phaseone-iiq-calibration-2026-11-19.md).
Still open: rerunning the IIQ S and 16-bit files (the iXU180's blue is 5.2%
off), and a Capture One export of one of these frames, to check whether
Capture One's render agrees with LibRaw's.
