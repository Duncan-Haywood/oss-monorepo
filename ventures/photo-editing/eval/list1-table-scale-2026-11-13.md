# MapTable and per-row/column scales in OpcodeList1, 2026-11-13

## Question

`OpcodeList1` runs on the stored raw values. `MapTable`, `DeltaPerRow/Column` and
`ScalePerRow/Column` ran only in lists 2 and 3, since `eval/table-per-line-2026-11-12.md`
could not settle what unit a stored value is in. Does the DNG specification's own text settle it?

## Source

DNG Specification 1.7.1.0 (September 2023), Adobe's helpx PDF (URL in
`eval/opcode-spec-audit-2026-11-12.md`), fetched again 2026-11-13 and read with `pdftotext
-layout`. Chapter 6, p. 105:

> When processing an opcode list, image values are clipped after the application of each opcode
> to the logical range of the image being modified. For OpcodeList1, this range is 0 to 2^32-1 for
> images with a bit depth greater than 16, otherwise 0 to 2^16-1. For OpcodeList2 and
> OpcodeList3, the logical range is 0.0 to 1.0.

pp. 113-119 (MapTable, Delta/Scale per row and column) give the layouts, already matched, and no
unit for list 1.

## Reading

- **MapTable** ("maps ... through a 16-bit lookup table") on 16-bit integers: the stored value
  is the index. `table[min(v, n - 1)]`, the rule lists 2 and 3 already use after
  `floor(x * 65535 + 0.5)`. On a 16-bit stored image the two readings are the same function.
- **ScalePerRow/Column**: a multiplier is the same whatever the unit. Rounded half up and
  clipped to the list's integer range.
- **DeltaPerRow/Column, MapPolynomial**: the answer depends on the unit (stored counts, or
  `v / 65535` as the SDK converts 16-bit data to float, or `v / WhiteLevel`). Not settled; still
  named and undone in list 1.

## Implementation

`shootflow/dng_opcodes.py`: `plan` puts MapTable and the two scales from list 1 into
`Plan.stage1` (CFA files only, as for the bad-pixel fixes). `run_stage1` runs them in list order
with the bad-pixel fixes, through `_stored_area` (numpy view on the copy, or a pure loop). Skipped
with a note: MapTable on 32-bit stored data, and a plane range without plane 0.

## Checks

`tests/test_dng_list1_table_scale.py`, 12 tests, pure and numpy engines (`/usr/bin/python3.13`,
numpy 2.5.3; bare `python3` 3.11 without numpy runs the pure path and skips 5):

```
Ran 81 tests in 0.836s   (list1 + table_per_line + bad_pixels + opcodes + quality_flag + trim_bounds)
OK
```

Seeded faults in `_stored_area`, each run against the new file:

| Fault | Result |
| --- | --- |
| round down (no `+ 0.5`) | 14 failures |
| table index off by one | 12 failures |
| wrap instead of clip at the top | 5 failures, 10 errors |
| column pitch ignored | 13 failures, 1 error |

Develop-level: a sensor storing `floor(sqrt(v / 4095) * 65535 + 0.5)` with the expansion table in
`OpcodeList1` develops byte-identical to the clean 12-bit sensor (over 100 8-bit steps off with
`opcodes=False`); stored values darkened by known row and column gains come back within 3 x 257
16-bit steps (over 20 x 257 off).

Speed, 4032 x 3024 stored frame, median of 5 (numpy) or 1 run (pure), including the copy
`run_stage1` makes:

| Opcode | numpy | pure Python |
| --- | ---: | ---: |
| MapTable (4,096 entries) | 0.065 s | 1.36 s |
| ScalePerRow | 0.159 s | 2.61 s |
| ScalePerColumn | 0.153 s | 2.87 s |

## Not checked

- Any camera- or converter-written DNG with these opcodes in `OpcodeList1`.
- The SDK's float32 product: within float32 rounding of a half step it may give one count
  different from this float64 result.
- A unit for the deltas and MapPolynomial in list 1.
