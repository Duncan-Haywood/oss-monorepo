# Crop-tolerant burst grouping in the cull, 2026-11-17

Item: NEXT.md "From the cull showcase": a 4% reframe formed its own group, so a burst the camera moved through
cost the photographer an extra look. `shootflow cull` grouped frames only when their whole-frame 64-bit dHashes
were within 8 bits.

## What shipped

- `frame_analysis.crop_dhashes`: the same dHash over a 5 x 5 grid of windows, each 88% of the frame (offsets 0 to
  12% in 3% steps), stored on `FrameMetrics.dhash_crops`. About 4 ms a frame in pure Python (integral image).
- `frame_analysis.crop_distance`: the smallest distance between one frame's centre window and any window of the
  other, both ways (50 XOR-popcounts).
- `cull.crop_match`: a pair 9 to 24 bits apart on the whole frame also groups when `crop_distance <= 6` and is at
  least 5 below the whole-frame distance. The gain condition is what keeps distinct photos apart: for two
  unrelated frames the best of 50 windows is only a little below the whole-frame distance; for a pan it drops
  sharply. Pairs over 24 apart skip the window step, so a 1,986-photo cull groups in 0.9 s (0.2 s before).

## How it was measured

`PYTHONPATH=src python3 tools/cull_crop_grouping_eval.py --corpus <jpg dir> --work <scratch>` on the 332 JPEGs in
`jpg/` of github.com/drewnoakes/metadata-extractor-images at 7b56b649 (one, `beach.jpg`, does not decode: 331
used). These are real sample photos from many camera and phone models, nearly all of different scenes. Each photo is cut by
ffmpeg into burst-like variants at the cull's 320 x 180 analysis size:

- pan pairs: two windows of one photo offset by 2, 4, 6, 8 or 10% horizontally, vertically or diagonally;
- zooms: the whole photo against a 3-10% crop kept at the centre, top-left or bottom-right;
- brightness: the whole photo against `eq=brightness` -0.15 and +0.12.

Positives are those 32 pairs per photo; negatives are every pair of two different photos. Even-index photos are
the tune half, odd the held-out half. Constants were chosen on tune only (a scratch prototype whose whole-frame hash rounded cell edges
slightly differently, so its baseline counts differ by a few from the table below): the 8% margin 3 x 3 grid with
window thresholds 6/8/10/12, gains 0/3/4/5/6 and candidate limits 16/20/24/28/32, and the 12% margin 5 x 5 grid
with thresholds 6/8/10 and gains 0/4/5 at limit 24. The pick was the highest tune recall that added at most 2 tune
false merges. The 8% 3 x 3 grid at its best setting
reached 0.72 tune recall but added 9 tune false merges.

## Result (the shipped code, `tools/cull_crop_grouping_eval.py`)

| half | burst pairs | recall, whole frame | recall, shipped | distinct pairs | false merges, whole frame | shipped |
| --- | --- | --- | --- | --- | --- | --- |
| tune | 5,280 | 0.420 | 0.733 | 13,530 | 8 | 10 |
| held | 5,312 | 0.401 | 0.716 | 13,695 | 21 | 23 |

Held-out recall by variant (whole frame -> shipped), 166 photos each:

| kind | 2-3% | 4% | 6% | 8% | 10% |
| --- | --- | --- | --- | --- | --- |
| pan, horizontal | 0.73 -> 0.98 | 0.18 -> 0.96 | 0.08 -> 0.85 | 0.05 -> 0.30 | 0.05 -> 0.07 |
| pan, vertical | 0.97 -> 1.00 | 0.53 -> 1.00 | 0.27 -> 1.00 | 0.11 -> 0.75 | 0.07 -> 0.26 |
| pan, diagonal | 0.54 -> 0.95 | 0.13 -> 0.93 | 0.06 -> 0.75 | 0.04 -> 0.14 | 0.02 -> 0.05 |
| zoom, centre | 1.00 -> 1.00 | 0.98 -> 0.99 | 0.80 -> 0.85 | 0.51 -> 0.64 | 0.33 -> 0.43 |
| zoom, top-left kept | 0.74 -> 0.90 | 0.52 -> 0.94 | 0.19 -> 0.80 | 0.09 -> 0.55 | 0.05 -> 0.36 |
| zoom, bottom-right kept | 0.80 -> 0.91 | 0.63 -> 0.93 | 0.23 -> 0.75 | 0.09 -> 0.55 | 0.07 -> 0.37 |

Brightness pairs: 1.00 and 0.96 before and after (the windows add nothing there; dHash already ignores a level
shift).

The false merges, both before and after, are mostly pairs of different photos with the same layout: a dark
ground under a bright horizon (sunsets, a figure against the sun, a skyline), and near-blank frames. A few
before-and-after pairs are true duplicates in the corpus (`Issue 508` / `Issue 614` / `Sony DSC-P12`, the two
`Issue 600` files, the two Epson 3000Z files), so "false merges" overstates the error slightly on both rows.

## Showcase rerun

`tools/cull_showcase.py` (OpenCV samples) gives the same report as before: `building_c`, a 4% top-left crop scaled
back up, is 13 bits from its original on the whole frame and 7 on the best window pair, one over the rule's 6, so
it is still its own group. Equal-size windows match pans exactly but zooms only approximately; zooms are where
the remaining misses are.

## Limits

- The pairs are cut from one exposure. Real burst frames also differ by subject motion, parallax, focus breathing
  and noise; recall on a real shoot will be lower than here.
- Pairs only. Single linkage chains a run of matches; on a real shoot, chained false merges between similar
  compositions (a sunset series) are the risk to watch, and a real shoot's picks (`--picks`) are the test.
- Near-blank and low-contrast frames have unstable dHash bits whatever the windows.
