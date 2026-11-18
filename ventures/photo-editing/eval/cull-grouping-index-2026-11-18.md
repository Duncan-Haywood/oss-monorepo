# The cull's burst grouping without the all-pairs scan, 2026-11-18

Item: flagships.yaml `next:` / NEXT.md "grouping cost (10.7 s per 2,000 frames here, was 8.6; an index that
skips most distinct pairs)". `cull._group` compared every pair of photos. Since the crop gate rose to 44 bits
(eval/cull-crop-gate-2026-11-18.md) almost every pair of distinct photos reached the packed window check, so
the cost was quadratic: about 10 s for 2,000 frames and 251 s for 10,000 on this container, and `_MAX_FILES`
allows 20,000 (about 17 minutes extrapolated). A wedding is 3,000 to 6,000 frames.

## Why a pivot bound does not work

The first try was a triangle-inequality bound per frame (centre window as pivot, radius = its farthest
window), the same trick `zoom_index` uses inside one frame. On 1,000 frames it ruled out 10,000 of the 495,092
pairs that reached the window check, while only 1,087 of them linked. A frame's farthest window sits a median
26 bits from its centre (10th-90th percentile 16-32, same 1,000 frames), so the bound is too loose to cut
anything.

## What shipped

Every way two frames link needs some pair of 64-bit hashes within a few bits:

| pass | hash pair | within |
| --- | --- | --- |
| near duplicate | whole frame, whole frame | 8 |
| crop windows | one frame's centre window, any of the other's 25 windows | 6 |
| wide-pan windows | window a of the earlier frame, window b of the later (56 fixed lanes) | 5 |
| zoom windows | one frame's whole hash, any of the other's 100 zoom windows | 6 |

Cut a hash into three chunks (21, 21, 22 bits). Two hashes r bits apart differ by at most r // 3 bits in their
closest chunk, so looking each chunk up with every flip of up to r // 3 of its bits (254 keys for 22 bits and
2 flips, 23 for 1) finds every pair that can link. `cull._candidate_pairs` builds four such indexes (whole
hashes, crop windows, zoom windows, and pan windows grouped by their a-side window, 21 tables) and returns, per
pass, the later frames each frame could link to. `_group` then runs only that pass's exact check on those
pairs, so the decision rule and every constant are unchanged.

- The partition is the all-pairs scan's. `_group(rows, index=False)` keeps the old scan, and
  `tests/test_cull.py` `GroupingIndexTest` compares the two on synthetic bursts built so that every pass links
  some pairs, and checks that each pass's linked pairs are all among its candidates. Two seeded faults (a
  one-sided crop hit dropped; one flip too few per chunk) both fail it.
- The index turns on from 500 frames (`_INDEX_MIN_FRAMES`), where the two tie; below that nothing changes.
- No new hashes and no re-analysis.

## Result

`PYTHONPATH=src python3 tools/cull_group_timing.py WORK --n N --repeat 1 --compare`, frames drawn (seed 1) from
the 24,163 variants of the cull eval's corpus (the 331 decodable JPEGs in `jpg/` of
github.com/drewnoakes/metadata-extractor-images at 7b56b64, cut by tools/cull_crop_grouping_eval.py). Full
output in `cull-grouping-index-2026-11-18.txt`.

| frames | all pairs | index | faster | groups identical |
| --- | --- | --- | --- | --- |
| 500 | 0.55 s | 0.56 s | 1.0x | yes |
| 1,000 | 2.27 s | 1.35 s | 1.7x | yes |
| 2,000 | 9.5-10.0 s | 3.5-3.6 s | 2.8x | yes |
| 5,000 | 63.0 s | 13.3 s | 4.7x | yes |
| 10,000 | 250.8 s | 42.5 s | 5.9x | yes |

On 2,000 frames the index makes 211,555 candidate pairs of the 2.0 M (about 1 in 9.5), 9,064 of which link.
Building and probing the indexes takes 2.4 s of the 3.5 s; the rest is the exact checks.

## What is left

- The index time is not linear here: this corpus is 331 photos cut into about 73 variants each, so at 10,000
  frames each photo has about 30 frames in the sample and the true pairs grow with the square of that. A real
  shoot, with bursts of 3 to 15 frames among thousands of distinct moments, should sit nearer the linear end.
  Not measured: there is still no real shoot in the eval.
- Most of the remaining build time is the zoom windows (100 per frame, 300 table entries) and the 2.9 M pan
  lookups; a C helper, or 1-bit flips stored on the index side for the whole-hash table, are the next steps if
  grouping matters again.
- 10% pans (0.86-0.95) and single-linkage chaining on a real shoot, as before.
