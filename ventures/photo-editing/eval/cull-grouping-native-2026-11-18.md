# The cull's burst grouping in C, 2026-11-18

Item: NEXT.md, cull showcase, "grouping cost rose about 2.7x (10,000 frames 36 to 101 s; a C index
build?) ... next a C helper for the index build if it matters again". It did: with the fine-offset pass
(eval/cull-fine-offsets-2026-11-18.md) the Python candidate index took 7.9 s for 2,000 frames and 115 s
for 10,000 on this container, and `_MAX_FILES` allows 20,000. A wedding is 3,000 to 6,000 frames, so a
photographer waited about half a minute for grouping alone, after the analysis.

## What shipped

`src/shootflow/cull_native.py`: the Python index's lookups and `cull.burst_match`'s exact rule as one C
function, compiled with the system C compiler on first use and cached, the same build rules as the
other native helpers (`$CC`, `$SHOOTFLOW_CACHE`, `SHOOTFLOW_NATIVE=0` turns it off). `cull._group` runs it
by default and falls back to the Python index (200 frames up) or the all-pairs scan when it cannot build.

- **Same rule, no copies.** Every constant (gates, limits and gains of the four passes) and every lane
  table (crop centre, `_PAN_PAIRS`, `_FINE_PAIRS` through `_FINE_GRID`) is read from `cull.py` and
  `frame_analysis.py` at call time and passed in, so a re-tune in Python reaches C. A test changes
  `CROP_MAX_DISTANCE` and checks the C answer follows.
- **Same index.** Each 64-bit hash is cut into thirds (21, 21, 22 bits); a pair within r bits differs by
  at most r // 3 bits in its closest third, so each third is looked up with every flip of up to that many
  bits. Tables: whole frames (8), crop windows (6), zoom windows (6), one per pan a-window (5), the 49 grid
  windows (5). Each table is a counting-sorted bucket array instead of Python dicts of lists.
- **Every candidate gets the whole rule.** A pair found by one pass is checked against all of them, as
  (earlier, later), and the output is sorted and made unique, so it is exactly `_linked_pairs_all`'s set.
- **Threads.** Each frame's lookups are independent, so they are split across threads (`$SHOOTFLOW_THREADS`,
  default the CPU count, at most 16) over shared read-only tables. The answer does not depend on the
  count (tested at 1, 2, 3, 7 and 64).

## Checks

`tests/test_cull_native.py`: the C pairs equal the all-pairs scan's on six seeds of the synthetic bursts
in `tests/test_cull.py` (each pass links some pair alone there); `_group` gives the same groups by all
three paths; a boundary test builds 240 pairs with one lane of one pass exactly at its limit or one bit
past it, for whole-frame distances above the near-duplicate line, at and past each gate, both directions
of the one-sided crop and zoom passes. 15 seeded faults in the C source (each crop direction dropped, each
gain off by one, each gate `<` for `<=`, a zoom direction dropped, a limit raised, the crop lookup dropped,
the fine lookup cut to 25 windows, one flip too few per chunk) each fail at least one test. The boundary
test was added after the first two of those (one crop direction, the fine gain) passed the synthetic
bursts alone: their whole-frame distances mostly sat under 8 bits, where any pair links anyway.

A first draft laid the row out as [whole, crops, zooms, fines], so the 49 grid windows were not side by
side and the fine lanes read zoom hashes. The equality test caught it on its first run (101 extra pairs);
the row is now [whole, crops, fines, zooms].

## Result

`PYTHONPATH=src python3 tools/cull_group_timing.py WORK --n N --compare [--with-plain]`, frames drawn
(seed 1) from the 30,121 variants that `tools/cull_crop_grouping_eval.py` cuts from the 331 decodable
JPEGs in `jpg/` of github.com/drewnoakes/metadata-extractor-images at 7b56b64, hashes from
`tools/cull_fine_offsets_tune.py`'s cache; 4-core container. Full output: `cull-grouping-native-2026-11-18.txt`.

| frames | all pairs (Python) | index (Python) | C, 1 thread | C, 4 threads | groups identical |
| --- | --- | --- | --- | --- | --- |
| 200 | 0.43 s | 0.37 s | | 0.03 s | yes |
| 500 | 2.13 s | 1.19 s | | 0.05 s | yes |
| 2,000 | 36.2 s | 7.89 s | 1.01 s | 0.35 s | yes |
| 5,000 | | 34.4 s | | 1.86 s | yes |
| 10,000 | | 114.6 s | 21.2 s | 5.78 s | yes |
| 20,000 (`_MAX_FILES`) | | | 81.1 s | 21.7 s | |
| 30,121 (every variant) | | | | 47.1 s | |

On 10,000 frames the C path is 20x the Python index (5.4x on one thread) and links the same pairs (234,068 in a
single-thread run of the same 10,000). Against the analysis (about 117 ms a frame, eval/cull-fine-offsets-2026-11-18.md) grouping drops
from about 8% of a cull to under 0.5%.

## What is left

- The time still grows faster than linear here, for the reason the index eval gave: this corpus is 331
  photos cut into about 91 variants each, so the linked pairs grow with the square of the sample (234,068
  at 10,000 frames). A real shoot's bursts of 3 to 15 frames would sit nearer linear. Not measured: still
  no real shoot in the eval.
- Windows (`sys.platform == "win32"`) and machines without a C compiler keep the Python index.
- Single-linkage chaining on a real shoot, pans past 10.7%, as before.
