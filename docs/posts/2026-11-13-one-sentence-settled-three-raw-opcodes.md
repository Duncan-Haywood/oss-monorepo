---
title: "One sentence in the DNG spec settled three raw-file opcodes, and left three open"
seo_title: "DNG OpcodeList1 MapTable and ScalePerRow on stored raw values"
date: 2026-11-13
tags: [ventures, photo-editing, raw, dng]
description: "ShootFlow runs MapTable and row and column gains on DNG stored raw values: the spec's integer range for OpcodeList1 decides how."
---

A DNG file can carry three lists of processing steps, called opcodes. The
first, `OpcodeList1`, runs on the raw values exactly as the sensor stored
them, before black level or white balance. ShootFlow, the open-source photo
pipeline in this repository, already ran five value-mapping opcodes in the
later two lists: a lookup table (`MapTable`), and one offset or gain per row
or column (`DeltaPerRow`, `ScalePerColumn` and so on). In the first list it
named them and did nothing. The reason was simple. Nobody here knew what
unit a stored raw value is in. Is an offset of 0.01 a hundredth of the white
level, of 65,535, or of one count?

**The answer was in the specification all along, for half of them.** Chapter
6 of DNG 1.7.1.0 says values are clipped after every opcode "to the logical
range of the image being modified. For OpcodeList1, this range is 0 to 2^32-1
for images with a bit depth greater than 16, otherwise 0 to 2^16-1." So the
first list works on integers. That decides three of the five:

- **MapTable**: the stored value is the table index. A sensor that stores
  square-root-companded values, to fit a wide range into fewer bits, writes
  the expansion table here.
- **ScalePerRow and ScalePerColumn**: a gain has no unit, so `value x gain`,
  rounded half up and clipped to 0 to 65,535, is the same however you read
  the value. These fix a readout gain mismatch where it happens, on the raw
  counts with black level included.

The other three still have no unit: the two per-line offsets and
`MapPolynomial`. The text gives none for stored values, and no camera file
here carries them, so they stay named and undone.

**What the tests show.** A synthetic sensor that stored square-root-companded
16-bit values, developed with the expansion table in `OpcodeList1`, comes out
byte-identical to the clean sensor. Without the table it is over 100 8-bit
steps off. Rows and columns darkened by known readout gains come back within
3 16-bit steps of 257. Twelve tests check every value against the formula
written out separately, on both engines. Four planted bugs each fail 5 to 14
of them: rounding down, an off-by-one table index, wrapping instead of
clipping, and an ignored column step. On a 12 MP frame the table takes 0.07
seconds with numpy and a row gain 0.16 seconds.

**What is not known.** No camera- or converter-written file with these
opcodes in its first list has been tried. Adobe's SDK multiplies in 32-bit
floats, so a product that lands right on a half step may round one count
differently there. The details are in
`ventures/photo-editing/eval/list1-table-scale-2026-11-13.md`.
