# Wide pans in the cull's burst grouping, 2026-11-18

Item: flagships.yaml `next:` "cull: ... next pans of 8-10%". After the zoom windows
(eval/cull-zoom-windows-2026-11-18.md) held-out zooms of 3-10% grouped 0.98-1.00, but pans of 8-10% grouped
0.07-0.33 (horizontal and diagonal) and 0.28-0.77 (vertical).

## Why they split

The crop pass (2026-11-17) hashes 25 windows of 88% of the frame, on a 5 x 5 grid of offsets 0-12% in 3%
steps, and compares **one frame's centre window** with every window of the other. Holding one side at the
centre reaches content shifts of up to half the margin, 6%. A pan of s keeps 1 - s of the scene, so once both
frames are scaled to the analysis size the content has moved s / (1 - s) of the frame: 8.7% for an 8% pan,
11.1% for 10%. Those offsets need an off-centre window on *both* sides (A's window at 12% against B's at 0% is
a 12% offset), and the crop pass never compares such a pair. The zoom windows do not help: they compare a
whole frame against a smaller window, the wrong shape for a pan (the zoom note said so).

## What shipped

- `frame_analysis.pan_distance`: for each window offset the centre comparison cannot reach (56 of the 81
  offsets on a 5 x 5 grid: |dx| or |dy| of 3 or 4 steps), the one pair of windows nearest the middle of both
  frames, and the smallest Hamming distance among them. It uses the crop hashes already stored, so a catalogue
  analysed since 2026-11-17 gets the pass with no re-analysis.
- `frame_analysis.pan_pack` / `pan_within`: the same decision for the cull's all-pairs scan. Each frame's 56
  windows are packed into one integer of 64-bit lanes, so one XOR compares every pair and a lane-wise (SWAR)
  popcount says whether any lane is within the limit. Checked against `pan_distance` on 20,000 random frame
  pairs x 12 limits (0 disagreements; a unit test pins the threshold edges).
- `cull.pan_match`: a pair up to 44 bits apart on the whole frame also groups when some far pair of windows is
  within 5 and at least 6 closer than the whole frames. `cull.burst_match` is now whole frame, crop windows,
  wide-pan windows or zoom windows.

## How the constants were picked

`tools/cull_pan_windows_tune.py` on the tune half only (165 even-index photos of the same corpus as 2026-11-17:
the 331 decodable JPEGs in `jpg/` of github.com/drewnoakes/metadata-extractor-images at 7b56b64). Grid: one pair
per offset ("rep") or every pair at that offset ("all", 264 pairs), window threshold 4-8, gain 0/3/4/5/6/8,
candidate limit 20-36, then 40/44/64 when 36 sat at the grid's edge. Pick rule as before: the highest tune
recall that adds at most 2 tune false merges to the shipped rule.

| setting (tune half) | recall | false merges | 8-10% pan recall |
| --- | --- | --- | --- |
| shipped before (whole, crops, zooms) | 0.915 | 12 | 0.28 |
| rep, 4, gain 6, limit 36 | 0.977 | 13 | 0.87 |
| rep, 5, gain 6, limit 36 | 0.984 | 14 | 0.93 |
| rep, 5, gain 6, limit 44 (picked) | 0.986 | 14 | 0.95 |
| rep, 6, gain 6, limit 44 | 0.989 | 16 (over the bar) | 0.97 |
| all, 5, gain 6, limit 36 | 0.989 | 18 (over the bar) | 0.95 |

Recall stops rising past a limit of 44 (64 gives the same numbers). Comparing every pair at an offset buys
little recall for 4 more false merges, so one pair per offset it is.

## Result (held-out half, scored once with the pick)

`PYTHONPATH=src python3 tools/cull_crop_grouping_eval.py --corpus <jpg dir> --work <scratch>`, full output in
`cull-pan-windows-2026-11-18.txt` (the "shipped rule" column now includes the pan pass).

| half | burst pairs | before (zoom windows, 2026-11-18) | now | distinct pairs | false merges before / now |
| --- | --- | --- | --- | --- | --- |
| tune | 9,405 | 0.915 | 0.986 | 13,530 | 12 / 14 |
| held | 9,462 | 0.914 | 0.985 | 13,695 | 25 / 26 |

Held-out pans, before -> now (166 photos each):

| pan | 2% | 4% | 6% | 8% | 10% |
| --- | --- | --- | --- | --- | --- |
| horizontal | 1.00 -> 1.00 | 0.98 -> 0.98 | 0.86 -> 0.86 | 0.33 -> 1.00 | 0.10 -> 0.87 |
| vertical | 1.00 -> 1.00 | 1.00 -> 1.00 | 1.00 -> 1.00 | 0.77 -> 1.00 | 0.28 -> 0.95 |
| diagonal | 0.98 -> 0.98 | 0.95 -> 0.95 | 0.75 -> 0.85 | 0.15 -> 0.96 | 0.07 -> 0.86 |

Zooms and brightness pairs are unchanged (the zoom rows in the .txt match eval/cull-zoom-windows-2026-11-18.txt).

## What is left

- **6% pans now trail 8% ones** (0.85-0.86 horizontal and diagonal). A 6% pan moves the content 6.4%, between
  the grid's 6% and 9% offsets, so neither pass lines it up well; 10% (11.1%) sits 0.9% short of 12% and is at
  0.86-0.95 for the same reason. A finer grid (7 x 7, 2% steps) would cover both, at 24 more hashes a frame and a
  re-analysis; not tried.
- **Cost.** On 2,000 frames drawn from the eval's variants, grouping takes 3.5 s without the pan pass and 7.6-7.9
  s with it (pure Python, all pairs; candidate limit 36 gives 7.3 s). The packed check is about 1.8 us a pair and
  runs for most pairs, because a limit of 44 lets nearly every pair of distinct photos through. A per-pair
  `bytes.translate` popcount was no faster (2.4 us), and skipping pairs already in one group did not pay on this
  mix. Analysis time is unchanged (no new hashes).
- Pairs cut from one exposure, as before: a real shoot's subject motion, parallax and focus breathing are not in
  it, and single-linkage chaining across similar compositions is the risk to measure on a real shoot.

## Showcase rerun

`tools/cull_showcase.py`: identical report (5 groups for 5 scenes, 5 keepers, 6 alternates, 2 rejects; same
group for every photo), so `site/cull-report.webp` stands.
