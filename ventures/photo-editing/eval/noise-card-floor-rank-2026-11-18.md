# A card floor from the second-lowest scene, on 26 bodies no rule has read (2026-11-18)

Flagship item (portfolio/flagships.yaml `buildable:`, eval/noise-card-floor-real-2026-11-18.md, "What would
move it"): the card floor capped what ships (`cap@1.5`) and removed 17 of 24 losing rows on 153 fresh bodies,
but cost 0.0148 dB of mean luma against a 0.01 bar. The cost is the minimum's downward bias: a minimum of noisy
readings sits below the truth, so the cap binds on noisy frames that needed their full model. Two fixes were
open: (1) take the floor from more than the minimum, (2) take it on the pre-white-balance scale.

## Tuning, on rows already seen (features only, no scoring)

`tools/card_floor_ranks.py` over the two seen sets' features (`noise-card-floor-feats-` and `-fresh-feats-`,
5,312 rows): for each floor statistic and cap scale, how often `s x floor` binds on what ships, and how often
the capped sigma falls below 0.8 of the truth (`low`: the cap takes gain away). Full output:
`noise-card-floor-rank-features-2026-11-18.txt`.

| floor | s | binds, capped >= 0.8 x truth | binds, capped < 0.8 x truth | floor / truth, `equal` SNR 12 / 200 | `wb` SNR 12 / 200 |
|---|---|---|---|---|---|
| lowest scene (what was tested) | 1.5 | 558 | 194 | 0.88 / 1.78 | 0.54 / 1.34 |
| second-lowest scene | 1.25 | 506 | 234 | 0.90 / 2.04 | 0.59 / 1.50 |
| second-lowest scene | 1.5 | 385 | 56 | | |
| median scene | 1.5 | 343 | 51 | 0.91 / 2.06 | 0.60 / 1.52 |
| lowest, pre-white-balance | 1.5 | 552 | 204 | 0.88 / 1.78 | 0.54 / 1.35 |

- **The pre-white-balance scale changes nothing.** Dividing each frame's reading by its own white-balance noise
  factor before taking the floor moves the medians by 0.01 at most and the bind counts by a few rows. A card's
  frames are shot under similar light, so their as-shot gains differ little. The `wb` floor's 0.54 of the truth
  is not the floor's doing: each frame's own reading is already 0.67 of the truth there (the 2026-11-18 table).
  That is a scale question for the estimator, not the card. Fix (2) is closed.
- **The second-lowest scene cuts the harmful binds by 71%** (194 to 56) and keeps 69% of the useful ones. The
  median scene is close to it but needs more scenes to mean anything; the second-lowest is the smaller step.

Pick, from these features alone: `cap2@1.5`, the cap at 1.5 x the second-lowest scene on cards of three or more
kept scenes (the lowest elsewhere, so on smaller cards it is `cap@1.5`). Code: `card_floor(..., rank=2)`,
`sweep --cap --floor-rank 1,2`.

## Decision rule, committed before the set was fetched

The set: `fourth` in `noise-card-floor-files-2026-11-18.json`, written by `tools/pixls_list.py` from the
raw.pixls.us directory pages: bodies with three or more raw files of at most 40 MB, the first 4 by name of each
(the site's "Kodak C603  Kodak C643" folder counts as one card), in folders no earlier set read (Pentax, Samsung, Leica, FUJIFILM, Phase One, OM System, OM
Digital Solutions, Kodak, Sigma, NIKON CORPORATION, SONY, Leaf), and no body of the `first` or `fresh` sets:
96 files from 26 bodies. Repeat scenes dropped by `tools/card_scenes.py --same 0.8` as before; LibRaw truths,
binned 4 x 4, re-mosaicked on a Bayer grid (`sweep --bayer`; a Fujifilm or Sigma file's truth is LibRaw's
render, so its own layout does not matter). Every row scored once; no tune split; no arm picked after scoring.

Arms: `D`, `pcaguard@0.8` (what ships), `cap@1.5` (the lowest scene, as tested before; shown, not pickable),
`cap2@1.5`.

Adopt `cap2@1.5` as a card-level option only if, on the rows of cards with three or more kept scenes (where it
differs from `cap@1.5`), and again on all rows:

- (a) mean luma gain over `D` and mean colour gain over `D` each within 0.01 dB of `pcaguard@0.8`'s;
- (b) no more rows worse than `D` by over 0.1 dB (luma or colour) than `pcaguard@0.8`, and none such that
  `pcaguard@0.8` keeps within 0.1 dB.

If the set yields under 200 rows on cards of three or more scenes, the result is reported as too small to
decide, and nothing ships.
