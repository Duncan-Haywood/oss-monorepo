---
title: "Phase One IQ4 16-bit IIQ, read directly, and two colour matrices that disagree"
seo_title: "Phase One IQ4 150MP 16-bit IIQ read directly, checked against LibRaw"
date: 2026-11-18
tags: [photo-editing, raw, phase-one, iiq]
description: "ShootFlow now reads 16-bit IIQ L from the IQ4 150MP and Trichromatic: 520 M sensels equal to LibRaw. The IQ4's own matrix and LibRaw's disagree on colour."
---

[ShootFlow](https://marisstella.app/photo-editing/), the open-source photo pipeline in this
repository, learned two of Phase One's three IIQ settings today, IIQ L and IIQ S. It still
refused the third: the 16-bit IIQ L that Phase One's current flagship back, the IQ4 150MP,
writes in its "IIQ L 16-bit" and "IIQ L 16 Extended" modes. The IQ3 100MP and the
Trichromatic write it as well. Someone who pays for a 150 MP back for its tonal range is the
person most likely to pick the 16-bit setting, and until this evening those were the files
ShootFlow turned away.

They develop now. Two of the findings along the way are worth a post of their own.

## The format was mostly already there

The 16-bit format (format 8 in the file's own directory) uses the same code as 14-bit IIQ L.
Each row is split into two colour lanes, a code length is picked every eight columns, and a
length of 14 means a raw 16-bit value follows. The only difference is the last step. A 14-bit
file stores each value times four, so it fills a 16-bit range. A 16-bit file stores the value
unchanged. The decoder change was one shift amount, 2 or 0, in the Python reference and in the
optional C decoder.

Phase One publishes no specification, so as with every raw reader in this project the test is
LibRaw, the library behind most open-source raw tools. There are four public 16-bit files on
raw.pixls.us (two from an IQ4, one from an IQ3 100MP, one from a Trichromatic). Across them,
**519.9 million sensor values, and none differ from LibRaw 0.22.** The CFA, white balance, crop
and orientation match too. The IQ4's 14-bit file had never been fetched before, and it matches
as well. A 150 MP 16-bit frame reads in 1.1 to 1.4 seconds. Eleven files from ten other Phase
One bodies, re-read as a regression check, are unchanged.

## Are the two extra bits worth 25% more disk?

A 16-bit file is 25% bigger than its 14-bit twin (211 MB against 168 MB). We checked whether
the extra bits carry anything. They are used: each of the four possible values of the bottom two
bits turns up in 25.0% of sensels, where a 14-bit file padded out to 16 bits would have them all
zero. But the IQ4's read noise, measured in the masked columns beside the image, is 6.0 to 6.8
of the finest steps, which is 1.5 to 1.7 steps at 14 bits. Rounding to 14 bits adds 1.15 steps of
quantisation noise in quadrature, so the deepest shadows would get 1.4 to 1.8% noisier, under a
tenth of a stop. That is one measurement at one exposure, not a verdict on every scene. For
these frames, the 16-bit setting stores mostly noise in its extra bits.

## The IQ4's colour: two matrices, no referee

An IIQ carries its own colour matrix, so ShootFlow develops one without a separate camera
profile. On the IQ4, when we compared that develop with the same sensor data run through
LibRaw's matrix, the average colours were 0.09 apart in chromaticity. The usual gate is 0.02.

Our first plan was to stop trusting the IQ4's built-in matrix. Then we measured more carefully:

- **The matrix in the file is per sensor family, not per body.** Every CMOS back we looked at
  (IQ3 100MP, Trichromatic, IQ4 150MP, iXM-100, iXM-RS150F) carries the same nine numbers.
- **For the IQ3 100MP, LibRaw's matrix is the file's matrix**, converted. For the IQ4, LibRaw has
  its own.
- **Through 24 ColorChecker patches, the two IQ4 matrices differ by a mean delta E of 16**, with
  the cyan patch worst at 58. Greys agree within 0.6.
- **On the actual frame, a clear winter sky over conifers**, the file's matrix gives a cyan-blue
  sky and LibRaw's gives a lavender one. To our eye the file's looks more plausible. That is a
  judgement, not a measurement.

Neither matrix is ground truth. Refusing Phase One's matrix would have swapped a risk we can't
measure for a certain loss: no develop at all without a profile. So the file's matrix stays the
default, and a `.dcp` profile overrides it for anyone who has Adobe's. The same comparison also
showed that our 0.02 mean-colour gate passes bodies whose matrices disagree by delta E 8 to 12,
because their test frames are mostly neutral. The gate is a good check on levels and white balance
and a weak one on colour accuracy. That limit is now written down in the eval.

The way to settle it is a photographed colour target. raw.pixls.us has one for a Phase One
body, an IT8.7/2 card shot on the H 25, and that is the next test.

The full write-up, with every row: `ventures/photo-editing/eval/phaseone-iiq-16bit-2026-11-18.md`.
The format table is on the [camera RAW formats page](https://marisstella.app/photo-editing/camera-raw-formats.html).
