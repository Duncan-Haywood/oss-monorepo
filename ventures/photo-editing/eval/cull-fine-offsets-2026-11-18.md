# Pans between the window steps: fine offsets in the cull's burst grouping, 2026-11-18

Item: flagships.yaml `next:` "cull: ... next 10% pans (0.86-0.95, windows 6-11 bits: a finer grid)". After
the crop gate (eval/cull-crop-gate-2026-11-18.md) held-out 10% pans grouped 0.86-0.95 while 6% and 8% pans
grouped 0.96-1.00.

## Why they split

This time the guess in the item was right, and the 6% case shows why it had to be checked rather than assumed
(there the cause was the gate). A pan of s keeps 1 - s of the scene, so the content moves s / (1 - s) of the
frame. The crop and wide-pan windows sit at 0, 3, 6, 9 and 12% of the frame, so two windows can only be offset
by multiples of 3%. A 10% pan moves the content 11.1%, 0.9% short of 12%.

`tools/cull_fine_offsets_tune.py WORK --why 0.1` on the tune half: every one of the 10% pans the shipped rule
missed (33 pairs) had its best 3%-grid window pair 6-11 bits apart (the pass needs 5), and for 29 of them
a window pair at a whole-percent offset was 0-2 bits apart (3-5 bits for the other four). A side measurement on every third photo (both halves; it chose no
constant, only the grid's resolution) cut one window at the exact content offset minus a residue and counted
how often it stayed within 5 bits of the other frame's:

| residue (% of frame) | 0 | 0.25 | 0.5 | 0.75 | 1.0 | 1.25 | 1.5 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| horizontal pans, 6-10% (294) | 1.00 | 1.00 | 0.98 | 0.90 | 0.82 | 0.67 | 0.54 |
| diagonal pans, 6-10% (294) | 1.00 | 1.00 | 0.95 | 0.81 | 0.68 | 0.47 | 0.34 |

So the windows need to land within about half a percent of the true offset. The 3% grid's worst residue is
1.5%, and the eval's round pan sizes happened to sit near grid points (6% pans 0.4% off, 8% 0.3%) except 10%.
**Pans of 7% (content moved 7.5%, 1.5% off) and 9% (9.9%, 0.9% off) were never tested.** They were added to
the eval before tuning (`PANS` in tools/cull_crop_grouping_eval.py, with 5%), and the held-out half shows the
same gap: before this change 7% diagonal pans grouped 0.84 and 9% diagonal 0.78.

## What shipped

- `frame_analysis.FINE_MARKS = (0, 1, 2, 3, 6, 9, 12)`: 24 more 88% windows per frame (`fine_dhashes`,
  `FrameMetrics.dhash_fine`), at 1% and 2% on either axis. With the crop grid's 25 they form a 7 x 7 grid, and
  the differences of the marks are every whole percent from 0 to 12 (a sparse ruler), so any pan up to the
  12% margin has a window pair within 0.5% of it. 3.6 ms a frame on a 320 x 180 frame, against about 117 ms for
  the whole frame analysis.
- `fine_distance` / `fine_pack` / `fine_within`: one window pair per whole-percent offset that is not on the 3%
  lattice (625 - 81 = 544 offsets; the pair nearest the middle of both frames, as the wide-pan pass picks),
  packed into 544 64-bit lanes and checked with the same SWAR popcount as the window passes. Unit tests pin the
  packed check to `fine_distance` and the lane set to every off-lattice offset.
- `cull.fine_match`: a pair up to 44 bits apart on the whole frame also groups when some fine pair is within 5
  and at least 8 closer than the whole frames. `burst_match` is now whole frame, crop and wide-pan windows, zoom
  windows or fine offsets.
- The candidate index gets one table of each frame's 49 windows, radius 5: any fine lane within its limit has
  both windows in it, so the index stays exact (a test pins the indexed groups to the all-pairs scan with
  fine rows, rows without them and whole-frame-only rows mixed).
- **A frame analysed before today has no fine hashes**, and the fine pass skips any pair with an empty side;
  everything else groups as before. Re-running the analysis adds them.

## How the constants were picked

`tools/cull_fine_offsets_tune.py WORK` on the tune half only (165 even-index photos, the same corpus: the 331
decodable JPEGs in `jpg/` of github.com/drewnoakes/metadata-extractor-images at 7b56b64). Grid: threshold T 2-6,
gain G 4-16, gate L 28-44, every earlier pass as shipped. Rule as before: the highest tune recall that adds at
most 2 tune false merges.

| setting (T, G, L), tune half | recall | false merges | pan recall |
| --- | --- | --- | --- |
| before the fine pass | 0.9829 | 14 | 0.9588 |
| (6, 8, 40), the rule's pick | 0.9977 | 15 | 0.9992 |
| (5, 6, 40) | 0.9977 | 16 | 0.9992 |
| (5, 8, 44), picked | 0.9976 | 14 | 0.9992 |
| (4, 8, 44) | 0.9971 | 14 | 0.9977 |

Deviation from the pick rule, as on the crop gate: (6, 8, 40) is 0.0001 higher for one more false merge.
(5, 8, 44) adds none, uses the wide-pan pass's threshold (5) and the same gate as both window passes (44); the
gate makes no difference between 40 and 44 on this set. Chosen on the tune half before the held-out half was
scored.

## Result (held-out half, scored once with the pick)

`PYTHONPATH=src python3 tools/cull_fine_offsets_tune.py WORK --held 5 8 44`; full output in
`cull-fine-offsets-2026-11-18.txt`.

| half | burst pairs | before | now | distinct pairs | false merges before / now |
| --- | --- | --- | --- | --- | --- |
| tune | 10,890 | 0.983 | 0.998 | 13,530 | 14 / 14 |
| held | 10,956 | 0.982 | 0.998 | 13,695 | 26 / 26 |

(Recall before is lower than the 0.991 of the crop-gate note because the 5, 7 and 9% pans are now in the set.)

Held-out pans, before -> now (166 photos each):

| pan | 2% | 4% | 5% | 6% | 7% | 8% | 9% | 10% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| horizontal | 1.00 -> 1.00 | 0.99 -> 1.00 | 0.99 -> 1.00 | 1.00 -> 1.00 | 0.93 -> 1.00 | 1.00 -> 1.00 | 0.85 -> 1.00 | 0.87 -> 1.00 |
| vertical | 1.00 -> 1.00 | 1.00 -> 1.00 | 1.00 -> 1.00 | 1.00 -> 1.00 | 0.99 -> 1.00 | 1.00 -> 1.00 | 0.98 -> 1.00 | 0.95 -> 1.00 |
| diagonal | 0.98 -> 0.99 | 0.96 -> 1.00 | 1.00 -> 1.00 | 1.00 -> 1.00 | 0.84 -> 0.99 | 0.96 -> 1.00 | 0.78 -> 1.00 | 0.86 -> 1.00 |

Zooms move by at most 0.01 (zoom-TL 3%, zoom-BR 8%: 0.99 -> 1.00); brightness pairs are unchanged (dark 0.96).

## Cost

`tools/cull_group_timing.py WORK` (now reading the fine cache; `--no-fine` leaves the fine hashes out, as for a
catalogue analysed before today), frames drawn with seed 1 from the eval's variants, this session's 4-core
container:

| frames | without fine hashes | with them |
| --- | --- | --- |
| 500, index / plain | 0.47 / 0.52 s | 1.03 / 2.05 s |
| 2,000, index / plain | 2.9 / 8.6 s | 7.7 / 31.7 s |
| 10,000, index | 36 s | 101 s |

Groups are identical between the index and the plain scan in every run. The grouping costs about 2.7x what it
did; most of it is the index's 49 window lookups a frame (one table per a-window, like the pan pass, was slower:
9.5 s at 2,000). Against the analysis itself (about 117 ms a frame, so 20 minutes for 10,000) it is about 8%.
The index now starts at 200 frames instead of 500 (150 frames: index 0.26 s, plain 0.22 s; 250: 0.40 / 0.53 s).

## What is left

- Pans past 10.7% move the content past the 12% margin; nothing reaches them. A wider margin means re-tuning
  every window pass.
- Grouping cost: a C helper for the index build, or skipping the fine lookups for frames already in a group, if
  10,000-frame shoots become common.
- Pairs are still cut from one exposure: a real shoot's subject motion, parallax and focus breathing are not in
  it, and single-linkage chaining across similar compositions is the risk to measure on a real shoot.

## Showcase rerun

`tools/cull_showcase.py`: 5 groups for 5 scenes, 5 keepers, 6 alternates, 2 rejects, every photo in the same
group as before, so `site/cull-report.webp` stands.

## Against the every-other-pair pass (merged the same day, eval/cull-pan-all-pairs-2026-11-18.md)

Another session took the same item at the same time and shipped a different fix first: every window pair at the
wide-pan offsets, not only the one nearest the middle (held out 0.991 to 0.995; its note judged a finer grid
would not help, which holds for an even 2% grid but not for the sparse ruler here). Scored on the same frames
and halves as above, each pass on top of everything shipped before either:

| passes added | tune recall | tune false merges | held recall | held false merges |
| --- | --- | --- | --- | --- |
| neither | 0.9829 | 14 | 0.9822 | 26 |
| every other pair (5, gain 10) | 0.9925 | 15 | 0.9946 | 26 |
| fine offsets (5, gain 8) | 0.9976 | 14 | 0.9983 | 26 |
| both | 0.9978 | 15 | 0.9984 | 26 |

With the fine pass in, the other pass adds 0.0001-0.0002 recall for one tune false merge and about 1.8x the
grouping time (its own note), so the cull runs the fine pass alone. `pan_other_distance`, `other_pack` and
`other_within` stay in `frame_analysis` so `tools/cull_pan_other_tune.py` and its note can be rerun.
