# Zoom windows in the cull's burst grouping, 2026-11-18

Item: NEXT.md "From the cull showcase": "a scaled window set for zooms of 4-10%". The crop-tolerant pass of
2026-11-17 (eval/cull-crop-grouping-2026-11-17.md) compares equal-size 88% windows, which line up a pan exactly
but a zoom only roughly: held-out zoom recall at 10% was 0.36-0.43, and the showcase's 4% corner reframe
(`building_c`) stayed its own group.

## What shipped

- `frame_analysis.zoom_dhashes`: the same 64-bit dHash over windows of 96, 94, 92 and 90% of the frame, each at
  5 x 5 positions from the top-left to the bottom-right corner (100 hashes, about 6 ms a frame in pure Python),
  stored on `FrameMetrics.dhash_zooms`.
- `frame_analysis.zoom_distance`: the smallest distance between one frame's whole-frame hash and any zoom window
  of the other, both ways (if B is A zoomed in by z, B whole is A's window of size 1 - z).
- `cull.zoom_match`: a pair 9 to 28 bits apart on the whole frame also groups when that distance is at most 6
  and at least 6 below the whole-frame distance. `cull.burst_match` is the whole rule (whole frame, crop
  windows, zoom windows).
- `frame_analysis.zoom_index` / `zoom_distance_within`: an exact shortcut. Each frame's 100 windows are cut
  into 16 blocks of neighbours; a block's medoid and radius bound every member's distance by the triangle
  inequality, so blocks that cannot reach the limit are skipped. Same decision as the full scan for every pair
  (a randomized test checks it against `zoom_distance`, and the eval below gives identical counts); on the 331
  photos it skips 86% of the block scans for pairs inside the candidate distance.

A catalogue analysed before today has no `dhash_zooms`; those frames simply skip the zoom pass.

## How the constants were picked

`tools/cull_crop_grouping_eval.py`, same corpus and split as 2026-11-17: the 332 JPEGs in `jpg/` of
github.com/drewnoakes/metadata-extractor-images at 7b56b649 (`beach.jpg` does not decode: 331 used), even-index
photos tune, odd held out. `tools/cull_zoom_windows_tune.py` scored (on the variant set before the off-grid and off-size zooms were added; rerun now it scores those too), on tune only, scale sets {0.96, 0.94, 0.92, 0.90},
{0.95, 0.91}, {0.95, 0.92, 0.89} and {0.965 ... 0.905 in five}, 3 x 3 or 5 x 5 positions, window thresholds 4-8,
gains 0/3/4/5/6 and candidate limits 20/24/28 (600 settings). The pick rule was the 2026-11-17 one: the highest
tune recall that adds at most 2 tune false merges to the shipped rule. It chose four scales, 5 x 5, threshold 6,
gain 6, limit 28 (tune recall 0.740 to 0.886 on that day's pairs, false merges 10 to 12). Every 5 x 5 setting
beat every 3 x 3 one, and the two-scale set came within 0.004, so the result does not hinge on the window
sizes matching the test zooms.

Two checks were added before the held-out half was scored, so the pick could not have fitted them:

- off-grid zooms (`zoom-off`): the kept part a quarter of the way in on one axis and three quarters on the
  other;
- off-size zooms: 5, 7 and 9% crops, which no window size matches (0.95, 0.93, 0.91 would).

## Result

`PYTHONPATH=src python3 tools/cull_crop_grouping_eval.py --corpus <jpg dir> --work <scratch>`, full output in
`cull-zoom-windows-2026-11-18.txt`.

| half | burst pairs | whole frame | crop windows (2026-11-17) | shipped | distinct pairs | false merges: whole / crops / shipped |
| --- | --- | --- | --- | --- | --- | --- |
| tune | 9,405 | 0.462 | 0.736 | 0.915 | 13,530 | 8 / 10 / 12 |
| held | 9,462 | 0.440 | 0.720 | 0.914 | 13,695 | 21 / 23 / 25 |

Held-out zoom recall, crop windows -> shipped (166 photos each, `zoom-off` 332):

| kept part | 3% | 5% | 7% | 9% | 10% |
| --- | --- | --- | --- | --- | --- |
| centre | 1.00 -> 1.00 | 0.95 -> 1.00 | 0.74 -> 1.00 | 0.57 -> 1.00 | 0.43 -> 1.00 |
| top-left | 0.90 -> 0.99 | 0.85 -> 1.00 | 0.72 -> 1.00 | 0.46 -> 0.98 | 0.36 -> 0.98 |
| bottom-right | 0.91 -> 1.00 | 0.88 -> 1.00 | 0.66 -> 0.99 | 0.51 -> 0.99 | 0.37 -> 0.99 |
| off-grid | 0.98 -> 1.00 | 0.90 -> 1.00 | 0.72 -> 1.00 | 0.51 -> 1.00 | 0.40 -> 1.00 |

Pans gain a little (held 8% horizontal 0.30 -> 0.33, vertical 0.75 -> 0.77) but pans of 8-10% are still mostly
split; the zoom windows are the wrong shape for them.

The four added false merges (two per half) are pairs of different photos of one layout, as before: Bushnell
Trophy HD / Trust PowerCam (13 apart), FinePix S5500 / Noritsu Koki QSS (9), FinePix A303 / Lumia 800 (10),
Issue 308 / Lumia 800 (12).

## Cost

- Analysis: +6 ms a frame (100 window hashes from the integral image the crop windows already build).
- Grouping (pure Python, all pairs): 331 distinct photos 0.031 s -> 0.19 s before the block shortcut; scaled
  to 2,000 photos about 1.1 s -> 7 s. With the shortcut, on 1,986 frames drawn from the eval's variants
  (many near pairs, a hard case) 1.07 s -> 2.76 s (6.48 s without it), identical groups. 30% of distinct-photo
  pairs here are within 28 bits, so the pass runs often; the candidate limit is what to lower first if a
  very large card makes it slow.

## Showcase rerun

`tools/cull_showcase.py` (five OpenCV sample photos, known degradations): `building_c`, the 4% top-left crop
scaled back up, now groups with its original as an alternate (0.86, tied with the original's score, so a close
call). The report shows 5 groups for 5 scenes (was 6), 5 keepers, 6 alternates, 2 rejects; still no blurred or
darkened copy chosen as keeper. `site/cull-report.webp` was re-shot from this run (building and butterfly
bursts, 800 px CSS width at 1.5x).

## Limits

- Pairs cut from one exposure, as on 2026-11-17: real bursts add subject motion, parallax, focus breathing and
  noise. A real shoot's picks (`--picks`) remain the test, and single-linkage chaining across similar
  compositions (a sunset series) is the risk to watch there.
- A zoom tighter than 10% or combined with a pan of more than a few percent is not covered by any window.
