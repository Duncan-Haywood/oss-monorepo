# 10% pans in the cull's burst grouping: every window pair at the wide offsets, 2026-11-18

Item: flagships.yaml `next:` "cull: ... next 10% pans (0.86-0.95, windows 6-11 bits: a finer grid)".

## First, the 6% pans are already fixed

eval/cull-pan-windows-2026-11-18.md left "6% pans now trail 8% ones (0.85-0.86)". Rerun today on the same
corpus (the 331 decodable JPEGs in `jpg/` of github.com/drewnoakes/metadata-extractor-images at 7b56b64), 6%
pans group at 0.99-1.00 on both halves. The crop gate change later that day (eval/cull-crop-gate-2026-11-18.md)
fixed them, and NEXT.md already said so. Only the 10% pans were open: held out 0.87 horizontal, 0.95 vertical,
0.86 diagonal.

## Is the grid the limit? No, the choice of pair is

A 10% pan keeps 90% of the scene, so between the two frames the content moves 0.10 / 0.90 = 11.1% of the
frame. The 5 x 5 grid of 88% windows has offsets in 3% steps, so the nearest is 12%, 0.9% off. A finer 7 x 7
grid (2% steps) has 12% and 10% offsets, still 0.9-1.1% off, so it cannot line up a 10% pan any better.

A scratch diagnostic on the 165 tune photos' 10% pans compared, per pair, the window distance with the
windows placed exactly on the true shift, the best pair on today's 5 x 5 grid and the best on a 7 x 7 grid:

| 10% pan | exact shift, mean bits | 5 x 5 best pair | 7 x 7 best pair | share within 5 bits (exact / 5 x 5 / 7 x 7) |
| --- | --- | --- | --- | --- |
| horizontal | 0.47 | 1.66 | 0.93 | 1.00 / 0.99 / 1.00 |
| vertical | 0.01 | 0.71 | 0.39 | 1.00 / 1.00 / 1.00 |
| diagonal | 0.29 | 3.35 | 2.11 | 1.00 / 0.87 / 0.97 |

So on the existing grid some pair of windows is within 5 bits for 99-100% of horizontal and vertical 10% pans.
The shipped pass compares only one pair per offset, the one nearest the middle of both frames (for a 4-step
horizontal offset, the middle row of five), and every 10% pan it missed failed there: of the 102 misses on both halves, 101
had that pair over 5 bits (the other had whole frames 47 apart, past the gate). For a 4-step horizontal offset
the top or bottom row often lines up better than the middle one. The diagonal corner offset (4, 4) has only
one pair on a 5 x 5 grid, so there the grid really is the limit: a finer grid would lift it, at 24 more
hashes a frame and a re-analysis.

## What shipped

- `frame_analysis._PAN_OTHER_PAIRS`: the other 208 window pairs at the 56 wide-pan offsets (264 in all, a unit
  test pins that together they are exactly the pairs offset beyond the centre window's reach).
- `cull.other_pan_match`: a pair up to 44 bits apart on the whole frame (the same gate) also groups when one of
  those pairs is within `PAN_OTHER_MAX_DISTANCE` (5) and at least `PAN_OTHER_MIN_GAIN` (10) closer than the
  whole frames. `burst_match` is now whole frame, crop windows, wide-pan windows, zoom windows or other wide-pan
  pairs.
- Packed like the others (`other_pack`, `other_within`: 208 64-bit lanes, one XOR and a SWAR popcount), checked
  against `pan_other_distance` on random pairs at every limit edge.
- The candidate index gained one table of all 25 windows at radius 5, queried with each window of the frame: a
  superset of the 208 pairs. A test builds pairs that link only through a top-row pair and checks the index
  finds them; with that table's lookups removed the test fails (seeded fault).
- No new hashes and no re-analysis: catalogues analysed since 2026-11-17 get it as they are.

## How it was picked

`tools/cull_pan_other_tune.py` on the tune half only (165 even-index photos), on the code before the pass:
threshold 2-5, gain 6-16, gate 36 or 44. Pick rule as before: the highest tune recall that adds at most 2
false merges to the shipped rule. Full grid in `cull-pan-all-pairs-2026-11-18.txt`.

| setting (tune half) | recall | false merges | 10% pans h / v / diag |
| --- | --- | --- | --- |
| shipped before | 0.9906 | 14 | 0.91 / 0.96 / 0.84 |
| 3 bits, gain 8, gate 44 | 0.9928 | 14 | 0.96 / 1.00 / 0.85 |
| 4 bits, gain 10, gate 44 | 0.9932 | 15 | 0.98 / 1.00 / 0.85 |
| **5 bits, gain 10, gate 44 (picked)** | 0.9936 | 15 | 0.99 / 1.00 / 0.87 |
| 5 bits, gain 6, gate 44 | 0.9936 | 18 (over the bar) | 0.99 / 1.00 / 0.87 |

A larger gain buys back the false merges at no recall cost up to 10. Past that, recall falls.

## Result (held-out half, scored once with the pick)

| half | burst pairs | before | now | distinct pairs | false merges before / now |
| --- | --- | --- | --- | --- | --- |
| tune | 9,405 | 0.991 | 0.994 | 13,530 | 14 / 15 |
| held | 9,462 | 0.991 | 0.995 | 13,695 | 26 / 26 |

Held-out 10% pans: horizontal 0.87 to 0.98, vertical 0.95 to 1.00, diagonal 0.86 to 0.89. 8% diagonal pans
0.96 to 1.00, 4% diagonal 0.96 to 0.97, two zoom rows 0.99 to 1.00; nothing went down. The shipped code
reproduces the tune tool's numbers exactly (`tools/cull_crop_grouping_eval.py`, in the .txt).

## Cost

`tools/cull_group_timing.py`, same container and draw (seed 1) as before:

| frames | before | now | groups identical, index vs all pairs |
| --- | --- | --- | --- |
| 2,000 | 2.97 s | 5.36 s | yes |
| 5,000 | 11.81 s | 21.70 s | yes |

About 1.8x. On this corpus (331 photos cut into about 73 variants each) many frames are genuine near matches,
so the new table finds about as many candidates as the crop windows (131,853 vs 130,054 on 2,000 frames); a
real shoot of mostly distinct moments should find far fewer. Packing the 208 lanes into the existing window
check instead (one 313-lane XOR for every candidate) was tried first: 5.64 s, so checking them separately and
only for their own candidates is kept. Ten-odd seconds on 5,000 frames is small next to decoding and analysing
them, but it is the next thing to cut if grouping cost matters again: a C helper for the index (as the index
note said), or per-offset tables (208 values a frame to insert instead of 25).

## What is left

- Diagonal 10% pans (0.89): the corner offset has one pair on a 5 x 5 grid. A 7 x 7 grid would reach 0.97 on
  the tune half (best pair within 5 bits, scratch diagnostic, no false-merge count yet), at 24 more hashes a
  frame and a re-analysis.
- Pans past 10% (not in the eval), and every pair here is cut from one exposure: subject motion, parallax and
  single-linkage chaining on a real shoot are still unmeasured.
