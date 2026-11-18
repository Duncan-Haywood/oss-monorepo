# The sRGB encode, interpolated: 16-bit output reaches 45,000-65,536 levels, not 4,096 (2026-11-17)

Item from NEXT.md and the flagship's `buildable:` (found by eval/noise-aware-float32-2026-11-17.md, where every
changed value was "exactly one step of the develop's 4,096-entry tone table"): "The develop's 4,096-entry tone
table caps a 16-bit output at 4,096 levels per channel: interpolate between entries, or a larger table, checked
against the pure path and LibRaw."

**Verdict: shipped. The develop's last step, linear light to sRGB, now reads a 16,384-entry table with linear
interpolation instead of a 4,096-entry table at the nearest entry. On five public camera DNGs the 16-bit output
holds 45,014-65,536 distinct values per channel (was 2,239-4,096), every value is within 1 code of a
near-exact reference (was up to 104 codes off, 81-96% of values off), the pure-Python and numpy engines still
give identical bytes, and agreement with LibRaw's render improves (99th-percentile gap, 8-bit steps: Leica T
0.136 to 0.035, Pentax Q-S1 0.160 to 0.047, Nexus 5X 1.198 to 1.152).** Every develop's output bytes change.

## What changed

- `raw_develop.srgb_table(size)` samples the sRGB curve at `SRGB_TABLE_SIZE` = 16,384 even linear steps,
  unrounded (x 65535). `encode` (pure path) and `raw_develop_np._encode` (numpy) read it as
  `lo + (t - i) * (hi - lo)` with `t = v * (size - 1)`, and round once (`floor(x + 0.5)`), in the same float64
  operations so both engines agree byte for byte. Values at or below 0 and at or above 1 still go to 0 and 65535.
- The profile tone curve (`dng_colour.ToneCurve`, 4,096 steps) already interpolated, as dng_sdk does; it is
  unchanged. Only the final sRGB encode was a nearest-entry read.
- Cost: building the table is 16,384 `pow` calls per develop (milliseconds); the numpy read does one more gather
  and a multiply-add per value.
- `tests/test_srgb_table.py`: within 1 code of the exact curve over 400,001 values, over 60,000 levels reached,
  shadow steps at most 2 codes (the old table stepped 207 codes just above black).
- `tools/srgb_table_check.py`: the curve-only comparison (`--curve`) and the per-file one below.

## The table on its own

`--curve`: the encode against the exact sRGB curve at 20,000,001 even linear inputs.

| table | largest error, codes of 65,535 | levels reached | share not equal to the exact code |
|---|---|---|---|
| 4,096 entries, nearest (old) | 103.8 | 4,096 | 91.0% |
| 4,096, interpolated | 1.07 | 65,536 | 0.40% |
| **16,384, interpolated (new)** | **0.22** | 65,536 | 0.025% |
| 65,536, interpolated | 0.034 | 65,536 | 0.0015% |

The largest errors sit in the shadows, where the curve is steepest (12.92x below linear 0.0031308, and
strongly curved just above it). 16,384 interpolated keeps every value within a quarter code; the 4,096
interpolated table would already have fixed the levels cap but left a 1-code error near the knee.

## Real files

`tools/srgb_table_check.py --old <main's src>`: each file developed at full size on the numpy engine three
ways: main before this change, this change, and this change with a 1,048,576-entry table (the reference,
within 0.0002 codes of the exact curve). Files: the camera DNGs of drewnoakes/metadata-extractor-images
(free to use, per its README); downloaded at check time, not committed. The NEF, ARW and RAF files need a
camera `.dcp` to develop and were not run; the encode is the same code for every format.
Rows: `srgb-table-interp-2026-11-17.jsonl`.

| file | size | distinct values R, G, B: old | new | reference | largest gap to reference: old | new | share off: old | new |
|---|---|---|---|---|---|---|---|---|
| LG Nexus 5X | 4016x3008 | 3,864 / 4,094 / 4,096 | 62,971 / 64,172 / 65,536 | same as new | 104 | 1 | 93.7% | 0.048% |
| Leica T (Typ 701) | 4928x3264 | 4,084 / 4,025 / 4,096 | 59,201 / 55,696 / 65,528 | 59,197 / 55,695 / 65,528 | 104 | 1 | 95.3% | 0.066% |
| DJI Phantom 4 | 3992x2992 | 4,042 / 4,053 / 4,050 | 55,948 / 55,688 / 55,917 | 55,948 / 55,688 / 55,918 | 44 | 1 | 80.5% | 0.009% |
| Leica X VARIO (Typ 107) | 3264x4928 | 4,096 / 4,088 / 4,096 | 60,796 / 60,164 / 59,373 | 60,789 / 60,165 / 59,373 | 102 | 1 | 94.6% | 0.018% |
| Pentax Q-S1 | 4000x3000 | 2,329 / 2,349 / 2,239 | 45,816 / 46,246 / 45,014 | 45,814 / 46,248 / 45,018 | 104 | 1 | 96.2% | 0.145% |

## Pure path against numpy

`tools/develop_engine_check.py --half` on the Pentax Q-S1 and Nexus 5X DNGs: identical bytes from both engines
(`srgb-table-interp-engines-2026-11-17.jsonl`; 11.7 s and 17.3 s pure Python, 0.4 s and 0.7 s numpy).

## Against LibRaw

`tools/dng_camera_check.py --colour dcraw` (rawpy 0.28.0), as in eval/camera-dngs-2026-11-12.md: half size,
the file's own matrix, BaselineExposure, profile tables, tone curve and opcodes off; LibRaw with camera white
balance, no auto-brightening and the sRGB curve. 99th percentile of the per-value gap, in 8-bit steps:

| file | old | new |
|---|---|---|
| Leica T (Typ 701) | 0.136 | **0.035** |
| Pentax Q-S1 | 0.160 | **0.047** |
| LG Nexus 5X | 1.198 | **1.152** |

Channel means and linear ratios are unchanged to four places. The Nexus's remaining gap is its fractional black
level, which LibRaw rounds (eval/camera-dngs-2026-11-12.md); on the two cameras with whole-number blacks the
remaining p99 is under 0.05 of an 8-bit step, so most of the old gap to LibRaw was this table.

## What it does not settle

- An 8-bit PNG export is a further rounding of the 16-bit value; at most it moves by one 8-bit step where the
  old value sat near a step edge. Not measured separately.
- Whether a user can see the difference: the old steps (up to 104 codes, 0.4 of an 8-bit step) were below an
  8-bit step but compound when a 16-bit TIFF master is pushed hard in an editor (a shadow lift of 3 stops makes
  a 104-code step about 830 codes, 3 8-bit steps: visible banding in smooth gradients). Not tested on a real edit.
