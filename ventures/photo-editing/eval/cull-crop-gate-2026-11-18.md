# 6% pans in the cull's burst grouping: the gate, not the grid, 2026-11-18

Item: flagships.yaml `next:` "cull: ... next 6% pans (0.85, a 7x7 grid?)". After the wide-pan pass
(eval/cull-pan-windows-2026-11-18.md), held-out 6% pans grouped 0.85-0.86 horizontally and diagonally while
8% pans grouped 0.96-1.00. That note guessed the cause was the 5 x 5 window grid (a 6% pan moves the content
6.4%, "between the grid's 6% and 9% offsets") and proposed a 7 x 7 grid, which would need 24 more hashes per
frame and a re-analysis of every catalogue.

## Why they split

The guess was wrong. 6.4% is 0.4% from the grid's 6% offset, about one pixel at the 320-pixel analysis size.
`tools/cull_crop_gate_tune.py WORK --why 0.06` sorts every 6% pan the shipped rule missed by the reason. On
the 993 pairs of all 331 photos, 901 grouped and all 92 misses failed the same way: the whole frames were
25-33 bits apart, past the crop pass's gate (`CROP_CANDIDATE_MAX_DISTANCE`, 24), while the centre window and
a window of the other frame were within 0-4 bits for 89 of the 92 (5 and 7 bits for the other three). The
crop windows lined the pan up. The gate just never let the pair reach them. The wide-pan pass is gated at
44, but it compares only the offsets the crop pass cannot reach, so nothing compared these pairs.

## What shipped

- `cull.CROP_CANDIDATE_MAX_DISTANCE` 24 -> 44, the same gate as the wide-pan pass. The window threshold (6)
  and the gain (5) are unchanged.
- The crop and wide-pan checks now run as one packed comparison (`frame_analysis.window_pack` /
  `windows_within`, `cull.window_match`). Each frame's 49 crop pairs (its centre window against each window
  of the other, each of its windows against the other's centre, the centre pair once) and 56 wide-pan pairs
  sit in one integer of 105 64-bit lanes. One XOR and a lane-wise popcount check every lane against its own
  limit (a per-lane bias; a limit of -1 turns a kind off). The popcount's last three shift-adds became one
  multiply by 0x0101010101010101 (each lane's byte counts total at most 64, so no carry crosses a lane),
  about 20% faster per call. Unit tests pin `windows_within` to `crop_distance` / `pan_distance` on 1,500
  random pairs x 7 limit settings, and `window_match` to `crop_match or pan_match` on 400 x 17 distances.
- No new hashes. A catalogue analysed since 2026-11-17 gets the change with no re-analysis.

## How the constants were picked

`tools/cull_crop_gate_tune.py WORK` on the tune half only (165 even-index photos, the same corpus as before:
the 331 decodable JPEGs in `jpg/` of github.com/drewnoakes/metadata-extractor-images at 7b56b64). Grid:
threshold T 3-7, gain G 3-16, gate L 24-44, every other pass as shipped. The rule from earlier notes is the
highest tune recall that adds at most 2 tune false merges.

| setting (T, G, L), tune half | recall | false merges | 6% pan recall |
| --- | --- | --- | --- |
| shipped (6, 5, 24) | 0.9858 | 14 | 0.913 |
| (6, 5, 44), picked | 0.9906 | 14 | 0.998 |
| (7, 5, 44), the rule's pick | 0.9915 | 16 | 1.000 |
| (7, 6, 44) | 0.9900 | 14 | 1.000 |
| (6, 5, 36) | 0.9905 | 14 | 0.998 |

Deviation from the pick rule: (7, 5, 44) has the highest tune recall within 2 false merges, but it gains
0.0009 recall for 2 more false merges and changes a threshold the diagnosis gave no reason to touch. (6, 5,
44) changes only the gate that caused the misses, adds no tune false merge, and uses one gate for both
window passes. The choice was made on the tune half before the held-out half was scored.

## Result (held-out half, scored once with the pick)

`PYTHONPATH=src python3 tools/cull_crop_grouping_eval.py --corpus <jpg dir> --work <scratch>`. Full output is
in `cull-crop-gate-2026-11-18.txt`; its "crop windows" column now uses the 44 gate, so it rises too.

| half | burst pairs | before (pan windows, 2026-11-18) | now | distinct pairs | false merges before / now |
| --- | --- | --- | --- | --- | --- |
| tune | 9,405 | 0.986 | 0.991 | 13,530 | 14 / 14 |
| held | 9,462 | 0.985 | 0.991 | 13,695 | 26 / 26 |

Held-out pans, before -> now (166 photos each):

| pan | 2% | 4% | 6% | 8% | 10% |
| --- | --- | --- | --- | --- | --- |
| horizontal | 1.00 -> 1.00 | 0.98 -> 0.99 | 0.86 -> 1.00 | 1.00 -> 1.00 | 0.87 -> 0.87 |
| vertical | 1.00 -> 1.00 | 1.00 -> 1.00 | 1.00 -> 1.00 | 1.00 -> 1.00 | 0.95 -> 0.95 |
| diagonal | 0.98 -> 0.98 | 0.95 -> 0.96 | 0.85 -> 1.00 | 0.96 -> 0.96 | 0.86 -> 0.86 |

The shipped column for zooms and brightness is unchanged. Only the intermediate crop-windows column for
zooms moved (by 0.01-0.03).

## Cost

`tools/cull_group_timing.py WORK` times `cull._group` on 2,000 frames drawn (seed 1) from the eval's variants,
best of 3, on this session's 4-core container, two runs each:

| code | groups | time |
| --- | --- | --- |
| before (gate 24, separate pan pack) | 280 | 8.75 s, 8.50 s |
| gate 44 with the old per-pair `crop_distance` | 279 | 17.8 s (one run, under load) |
| shipped (gate 44, one packed check) | 279 | 10.73 s, 10.65 s |

So the gate costs about 25% more grouping time, not the 2x a plain gate change would. The earlier note's
7.6-7.9 s for "before" was a different machine. This container gave 8.5-8.8 s for the same code. A cProfile
run puts most of what is left in the packed check (about 2M calls) and the zoom pass's `_nearest_within`
(1.2M calls). The quadratic all-pairs scan is the real limit. An index (multi-index hashing on the whole and
centre-window hashes) that skips most distinct pairs would cut both. Not tried.

## What is left

- **10% pans stay at 0.86-0.95.** These are window misses, not a gate: of the 102 misses among 993 pairs
  (all 331 photos), 101 are within the 44 gate. Their best wide-pan window pair is 6-11 bits apart (43 at 6,
  32 at 7, 27 at 8-11), just past the pan pass's limit of 5. The 11.1% content shift sits 0.9% from the
  grid's 12% offset, so a finer grid (or a 14% margin) would bring those windows closer, at 24 more hashes a
  frame and a re-analysis. A pan limit of 6 was already tried on the tune half (16 false merges, over the
  bar, eval/cull-pan-windows-2026-11-18.md).
- Single-linkage chaining on a real shoot, as before. Pairs here are cut from one exposure, so subject
  motion, parallax and focus breathing are missing.

## Showcase rerun

`tools/cull_showcase.py` gives the same report as after the pan windows: 5 groups for 5 scenes, 5 keepers,
6 alternates, 2 rejects, every photo in the same group. `site/cull-report.webp` stands.
