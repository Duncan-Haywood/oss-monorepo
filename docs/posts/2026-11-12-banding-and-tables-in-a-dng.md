---
title: "Column banding, row gains and lookup tables: five more DNG opcodes a raw reader should run"
seo_title: "DNG MapTable, DeltaPerColumn, ScalePerRow opcodes explained"
date: 2026-11-12
tags: [photography, raw, dng, image-processing, open-source]
description: "ShootFlow now runs DNG MapTable, Delta and Scale per row and column: what each fixes, the 16-bit choice, and how it was checked with no camera file."
---

ShootFlow, the open-source overnight pipeline for photographers in
`ventures/photo-editing`, has its own DNG developer. A DNG can carry
"opcodes", small instructions that tell a reader how to fix the sensor
data before showing it. Until today ShootFlow ran nine of the fourteen
the DNG 1.4 specification defines. It now runs five more:

| opcode | what it does | what it is for |
| --- | --- | --- |
| `MapTable` (7) | sends every value through a lookup table of up to 65,536 entries | a sensor's non-linear response, or a converter's tone map |
| `DeltaPerRow` (10) | adds one offset per row | readout noise that shifts whole rows |
| `DeltaPerColumn` (11) | adds one offset per column | the vertical banding many sensors show in the shadows |
| `ScalePerRow` (12) | multiplies by one gain per row | rows read through amplifiers that differ slightly |
| `ScalePerColumn` (13) | multiplies by one gain per column | the same, column-wise |

Before, a file carrying any of them got a line in the report ("1 x
DeltaPerColumn (required) not applied") and the banding stayed in the
picture.

## The one real choice: what a "value" is

All five take the same area, plane range and pitch as the polynomial
opcode, so "every other column of the green plane in the top half" is one
opcode. The arithmetic is simple. The question is what number the opcode
works on.

ShootFlow holds sensor values as floats from 0 (black) to 1 (white). The DNG
SDK, Adobe's reference reader, holds most images as 16-bit integers and
converts them to floats by dividing by 65,535 when an opcode wants floats.
That settles the table: a value `x` looks up entry `floor(x × 65535 + 0.5)`,
and a table shorter than 65,536 entries gives its last entry to every
value past its end. Two entries `[0, 32767]` therefore turn every non-black
sensel mid-grey, which one of the tests checks.

In the second and third opcode lists (after black subtraction and after
demosaic) that conversion lines up with ShootFlow's 0..1 view. In the
first list it does not: there the values are the camera's raw numbers, and
dividing a 12-bit sensor's 4,095 by 65,535 gives 0.06, not 1. An offset of
0.01 in that list means something quite different from one in the second.
We have no camera file that shows which unit cameras actually use there, so
ShootFlow runs these five in lists 2 and 3 and still names them, undone, in
list 1.

## How it is checked without a camera file

We could not find a public DNG that carries any of the five, so every check
is a closed form, written out in the test separately from the code:

* **Rows darkened, then restored.** A test sensor's row `y` is divided by
  `1 + 0.04y`; a `ScalePerRow` with those gains in the file develops back to
  the clean picture within 3 of 255 steps (the rounding of the darkened
  sensels). With opcodes off it is more than 10 steps out.
* **Column banding removed.** A random offset of 1 to 2.5% of full scale is
  added to each column; a `DeltaPerColumn` that subtracts it gives the clean
  picture back within 3 steps.
* **A square law undone.** Every value is squared; a 65,536-entry
  square-root `MapTable` restores it within 8 steps, the error being largest
  on the darkest patches where a square root is steepest.
* **Exact lookups.** Tables of 1, 2, 17, 4,096 and 65,536 random entries
  give exactly the written-out lookup on 205 values each.
* **The area is exact.** An opcode limited to rows 1 to 5 every third row,
  columns 2 to 6 every second, on plane 1 of 2, changes exactly those
  samples, each by its own row's or column's entry.
* **Two engines, one answer.** The numpy engine and the pure-Python one
  produce identical bytes, full and half size. On a 12 MP plane numpy runs
  each opcode in 0.15 to 0.34 s.

A list whose length does not match its area (two offsets for eight rows) is
skipped and named, as the SDK rejects it.

## What is not checked

These opcodes have not been seen on a real file, and Adobe's own output was
not available here to compare against; the SDK also computes in 32-bit floats
where ShootFlow uses 64, so an Adobe render may differ in the last bits. If you
have a DNG that carries any of them, especially one from a camera that writes
column fixes into the first opcode list, it would settle the unit question
above.

The code is MIT licensed: `ventures/photo-editing/src/shootflow/dng_opcodes.py`,
with the tests in `tests/test_dng_table_per_line.py` and the measurements in
`eval/table-per-line-2026-11-12.md`. Nothing here is professional advice; check
any output that matters against your own reference.
