# A card floor from the second-lowest scene, on 26 bodies no rule has read (2026-11-18)

**Verdict: nothing ships, and the card-floor line closes here.** `cap2@1.5` (the cap at 1.5 x the second-lowest
scene) fails test (a): on cards of three or more scenes it costs 0.020 dB of mean luma against a 0.01 bar. That
is half the cost of the minimum floor (0.035 dB), as the features predicted. But on these 24 bodies neither cap
fixes a single losing row, and the reason is not the floor. **On all 5 rows where what ships loses to the
directional demosaic by over 0.1 dB, the true noise model loses as much or more** (Pentax K-3 Mark III, SNR 200:
-0.58 dB luma with the oracle model, -0.58 with what ships). Those frames read their own noise at 0.93-1.76 of
the truth, so no estimate is to blame: the blend itself loses near clean. What is left to fix is in the blend's
ramps, not in the noise reading. Two other answers:

- **The pre-white-balance scale changes nothing** (features of 5,312 seen rows): a card's frames carry similar
  as-shot gains. The `wb` floor's low reading is the per-frame estimator's, not the card's.
- **The second-lowest scene does what it was meant to do** on unseen rows: its harmful binds fall from 23 to 7
  against the minimum's (`noise-card-floor-rank-fourth-features-2026-11-18.txt`), and its cost halves. With no
  texture-inflated losses on this set for it to remove, there was nothing to pay for that cost.

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

## The set as read

96 files listed from 26 bodies; LibRaw 0.22 could not open 13 (the Nikon Z5_2, Z6_3 and Z50_2 high-efficiency
NEFs, three Sony ILCE-7M5 compressed ARWs), so 83 files from 24 bodies. `card_scenes.py --same 0.8` kept 53
scenes: 10 cards of three or more scenes (FUJIFILM X-M5, Kodak DC120 and C330, Leaf Credo 40, Leica D-LUX
(Typ 109) and D-LUX 5, Pentax K-3 Mark III, Sony ILCE-1M2 and ILME-FX2, Samsung NX1100), 6 of two, 8 of one
(the Leica V-LUX (Typ 114), Samsung NX500, OM-1 Mark II, OM-3 and OM-5 Mark II sets are each one scene saved
several ways). 87 tiles, 696 rows, 440 of them on cards of three or more scenes (the rule asked for 200).

One correction after the rule was committed and before any row was read: the V-LUX (Typ 114) folder's
directory page links its files as `./name`, which `pixls_list.py` copied into the local name (a slash). The
four entries' names and URLs were fixed in the files list and the tool now strips the `./`; membership did not
change.

## Result, every row scored once

Gain over `D` in dB (`tools/card_floor_rule.py`, `noise-card-floor-fourth-rule-2026-11-18.json`):

| rows | arm | mean luma | mean colour | rows worse than `D` by > 0.1 dB (worst) | rows where the cap binds |
|---|---|---|---|---|---|
| 440 on cards of 3+ scenes | `pcaguard@0.8` (ships) | +0.9155 | +0.6237 | 5 (-0.58) | |
| | `cap@1.5` (lowest scene) | +0.8802 | +0.6058 | 5 (-0.58) | 38 |
| | `cap2@1.5` | +0.8951 | +0.6140 | 5 (-0.58) | 15 |
| all 696 | `pcaguard@0.8` (ships) | +0.6961 | +0.4719 | 5 (-0.58) | |
| | `cap@1.5` | +0.6720 | +0.4601 | 5 (-0.58) | 48 |
| | `cap2@1.5` | +0.6814 | +0.4652 | 5 (-0.58) | 25 |

- (a) **fails** on both: luma -0.0204 dB (3+ scenes) and -0.0147 dB (all) against what ships; colour -0.0097
  and -0.0067, inside the bar.
- (b) passes on both: the same 5 losing rows, none new.

Where the cost lands: every row on which `cap2@1.5` binds loses luma to what ships, 10.2 dB in total, 6.2 of it
on the Sony ILME-FX2 and 2.8 on the ILCE-1M2, most in the `wb` scenario (the floor there reads 0.62-0.72 of the
truth at SNR 12-60). The minimum floor loses 16.8 dB over twice as many rows.

## The five losing rows: the oracle loses too

`sweep --pca --scales 0.8` on the two files involved (arms `D`, `true`, `pcaguard@0.8`; rows in
`noise-card-floor-fourth-true-2026-11-18.jsonl`), gain over `D`, luma / colour:

| tile | SNR, scenario | true model | what ships | own reading / truth |
|---|---|---|---|---|
| K-3 Mark III IMGP9854 [276, 534] | 200 equal | -0.58 / -0.51 | -0.58 / -0.40 | 1.42 |
| | 200 wb | -0.55 / -0.56 | -0.28 / -0.15 | 1.09 |
| | 60 equal | -0.13 / -0.25 | -0.15 / -0.16 | 0.93 |
| Credo 40 CF003914 [444, 672] | 200 equal | -0.13 / -0.02 | -0.11 / -0.02 | 1.76 |
| | 200 wb | -0.12 / -0.01 | -0.12 / -0.01 | 1.36 |

On these two tiles knowing the noise exactly does not help: the bilinear side of the blend is worse than
directional on this detail at this noise level, and the ramps still give it weight. The 2026-11-18 note's 42
losing rows were, by contrast, frames reading 1.4-25x the truth, where the oracle did not lose. Both kinds exist;
the card floor can only reach the first, and on this set there were none of them.

## What this settles, and what would move it

- Across four sets and four rules, the card floor's only benefit is on near-clean frames whose fine texture reads
  as many times the noise, and it always costs 0.015-0.035 dB of mean luma elsewhere. That is not worth a
  card-level option in the product. **Closed**; `frame_noise` keeps sigma x 0.8 and the develop has no card option.
- Next, if anywhere: the blend's ramps near clean. The oracle loses up to 0.58 dB on a K-3 Mark III tile at SNR
  200. A gate that skips the blend when the model's sigma at 18% grey is below some fraction of the local detail
  is a ramp question, testable on the four sets' tiles with the `true` arm (oracle losses isolate the ramps from
  the estimate).

## Reproduce

    python tools/pixls_list.py --set fourth --per-body 4 --maker Pentax ... --exclude eval/noise-card-floor-files-2026-11-18.json   # the list, as committed
    python tools/pixls_fetch.py eval/noise-card-floor-files-2026-11-18.json --set fourth --out /tmp/raws > manifest.json   # 1.8 GB
    PYTHONPATH=src python tools/card_scenes.py --manifest manifest.json --cache /tmp/truths --same 0.8 > cards.json
    python -c "import json;d=json.load(open('cards.json'));print(''.join('/tmp/raws/'+n+'\n' for n in sorted(d) if d[n]['keep']),end='')" > kept.txt
    tr '\n' '\0' < kept.txt | PYTHONPATH=src xargs -0 -P 4 -n 1 python tools/noise_aware_estimated.py sweep --bayer --features-only --cards cards.json --cache /tmp/truths > feats.jsonl
    tr '\n' '\0' < kept.txt | PYTHONPATH=src xargs -0 -P 4 -n 1 python tools/noise_aware_estimated.py sweep --bayer --cards cards.json --card feats.jsonl --cap --floor-rank 1,2 --scales 1.5 --cache /tmp/truths > cap.jsonl
    python tools/card_floor_rule.py cap.jsonl --cards cards.json
    python tools/card_floor_ranks.py feats.jsonl

The makers passed, in order: Pentax, PENTAX, Samsung, SAMSUNG TECHWIN, Leica, LEICA CAMERA AG, Leica Camera AG,
Ricoh, RICOH, Fujifilm, FUJIFILM, Hasselblad, HASSELBLAD, Phase One, Olympus, OLYMPUS, OLYMPUS IMAGING CORP., OM
System, OM Digital Solutions, Minolta, KONICA MINOLTA, Kodak, Sigma; then NIKON CORPORATION, SONY, Leaf, Mamiya.
Python 3.13, numpy 2.x, rawpy 0.28 (LibRaw 0.22). At four processes the features pass and the cap sweep took under 10 minutes
together. Files (rows, basenames only): `noise-card-floor-fourth-cards-`, `-fourth-feats-`,
`-fourth-cap-`, `-fourth-rule-` and `-fourth-true-`, and the two `noise-card-floor-rank-*features*` tables.
