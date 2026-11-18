---
title: "The columns a Nikon stores that aren't picture, found without a camera table"
seo_title: "NEF masked columns: a raw file's visible area from the sensor data"
date: 2026-11-15
description: "Five of seven Nikon bodies store masked and padding columns at the right edge. A rule read from the sensels matches LibRaw's model table on all seven."
tags: [photo-editing, raw, nikon, evaluation]
---

The photo-editing pipeline reads Nikon NEF files directly: every sensel on seven real bodies, D70 to D810, equals what LibRaw decodes. But a developed D800E frame still came out wrong. Down its right edge ran a grey band, then a one-pixel white line, then fifteen black columns.

## What the camera stores past the picture

The D800E stores 7,424 columns. Only 7,378 are picture. The other 46 are 14 optically masked columns (sensels under a cover, reading about 600, the sensor's black), two columns of exactly 16,382 in every row, and thirty columns of 1. The D90 has 42 such columns, the D5100 44, the D300 32, the D70 one, and the D200 one at the left and three at the right. Only the D810 stores none.

Nothing in the file marks where the picture ends. The maker note has a crop tag, but on the D800E it gives the full stored size for both the sensor and the crop. dcraw and LibRaw handle this with a hand-kept table: for this model, drop this many columns. That works for every body someone has added to the table, and for no others.

## Two tests from the data

A picture column and a masked column differ in two ways you can measure.

1. **A picture column varies.** Down 1,200 rows of a real scene, a column's values spread out. A masked column varies by one to five levels of noise. The rule asks for at least a tenth of the spread in the middle of the frame.
2. **A picture column looks like its neighbour.** The sensel two columns over is the same colour and sees nearly the same scene, so the two columns correlate at 0.93 to 1.00 on these files. A masked column's noise has nothing in common with the next column's. The bar is 0.8.

Scanning in from each edge, the first column that passes both ends the margin. The left margin is rounded up to an even number so the colour filter pattern still lines up. The result becomes the raw's active area, and the developer already knows how to skip what lies outside it.

My first version had a third rule: a column near white is a clipped highlight, so keep it. The D800E's 16,382 columns broke it. They sit at 99.99% of white, so that version kept them and the thirty columns past them. Now a column holding one value in every row never counts as picture. A real blown-out edge still varies somewhere down 1,200 rows.

## Checked against LibRaw's table

On all seven bodies, the columns this rule drops are exactly the ones LibRaw's table drops: 46, 32, 44, 1, 0, 42, and 2 + 3. Every sensel still equals LibRaw's on both decoders. The D800E and D90 now develop 23 and 21 pixels narrower at half size, and their last columns are as bright as the ones just inside.

The closest call was the D70's single column. It varies by 4 levels against a floor of 4.2, so the spread test alone nearly calls it picture. Its correlation of 0.03 is what marks it.

## Does it ever cut picture?

I ran the rule on the picture alone, each file trimmed to LibRaw's visible area so the right answer is "trim nothing", at normal exposure and three and six stops darker. It trimmed nothing in 21 of 21 cases. On the darkest copies of the full frames it sometimes keeps a margin it should have cut: four of 21, all at three or six stops under. When the frame is too dark to tell, it keeps the columns rather than guess.

Seven bodies is not every Nikon. A body whose table entry nobody has written is the case the rule is for, and the case these seven files can't test. What they do show is that the rule reproduces the table on every body we could check, and fails safe.

The code is `masked_margins` in `ventures/photo-editing/src/shootflow/nef.py`, MIT licensed. The check is `tools/nef_libraw_check.py`, which now fails if the visible area differs from LibRaw's. The full measurements are in `eval/nikon-nef-visible-area-2026-11-15.md`.
