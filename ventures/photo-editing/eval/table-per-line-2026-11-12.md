# MapTable and Delta/ScalePerRow/Column (2026-11-12)

## What landed

`shootflow.dng_opcodes` runs DNG opcodes 7 (`MapTable`), 10 (`DeltaPerRow`), 11
(`DeltaPerColumn`), 12 (`ScalePerRow`) and 13 (`ScalePerColumn`) from `OpcodeList2` and
`OpcodeList3`, in list order with the opcodes already run (`Plan.stage2`, `Plan.stage3`). The
formulas and the choices are in the module docstring:

- area, planes and pitches as MapPolynomial's; row `y` takes entry `(y - top) // row_pitch`,
  column `x` entry `(x - left) // col_pitch`;
- a per-row (per-column) list must hold `ceil((bottom - top) / row_pitch)`
  (`ceil((right - left) / col_pitch)`) entries, as the DNG SDK requires; otherwise the opcode is
  named "unreadable and skipped";
- MapTable on 0..1 floats: index `floor(x * 65535 + 0.5)` with `x` pinned to 0..1, entries past
  the table's end take its last entry, result over 65535 (the SDK's 16-bit to float scale);
- delta and scale results pinned to 0..1; stage 3 divides by the white-balance scale and
  multiplies back, as for MapPolynomial;
- `OpcodeList1` does not run them: the SDK's float view of a stored raw value is
  `value / 65535`, independent of the white level, so a delta there is in a unit no file in the
  evaluation set shows. They stay named in the report there.

## Checks

`tests/test_dng_table_per_line.py`, 16 tests, all passing (Python 3.13 with numpy); the existing
opcode suites (`test_dng_opcodes`, `test_dng_vignette_poly`, `test_dng_bad_pixels`,
`test_dng_warp`, `test_dng_warp_fisheye`) pass unchanged, 79 tests together.

| test | answer it is held to |
| --- | --- |
| tables of 1, 2, 17, 4096 and 65536 random entries, 205 values each | lookup written out in the test, exact |
| identity table | value rounded to 16 bits |
| each of the four per-line opcodes, area rows 1-5 step 3, columns 2-6 step 2, plane 1 of 2 | exactly those samples changed, by the right entry |
| results past 0 or 1 | pinned |
| stage-3 column delta, table, row scale, white-balance scales 2.2/1.0/1.5 | closed form at every sample, 12 places |
| rows darkened by gains 1.00-1.60, ScalePerRow in OpcodeList2 | clean develop within 3 8-bit steps; off, more than 10 |
| per-column offsets of 0.01-0.025 added, DeltaPerColumn subtracts them | clean develop within 3 8-bit steps |
| values squared, 65,536-entry square-root MapTable | clean develop within 8 8-bit steps (the root is steep near black) |
| two-entry table | every value above 0 takes the last entry |
| a DeltaPerRow with 2 entries for 8 rows | skipped and named |
| numpy against pure Python, mixed lists in both stages, two sizes, full and half | identical bytes and notes |

numpy timing on a 3000 x 4000 plane: MapTable 0.34 s, ScalePerRow 0.16 s, DeltaPerColumn 0.15 s.

## Not checked

No camera- or converter-written DNG carrying any of the five has been tried, and the SDK's
own output was not available to compare against. The SDK runs these opcodes in float32 where this
module uses float64, so an Adobe render may differ in the last bits.
