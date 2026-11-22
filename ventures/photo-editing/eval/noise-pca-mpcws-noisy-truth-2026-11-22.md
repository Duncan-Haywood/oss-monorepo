# `mpcws` with a noisy-truth test: the two green sites as a second truth reading (2026-11-22)

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "next mpcws ... pre-registered with a stated
noisy-truth test"; NEXT.md, "From the min-eigenvalue noise read"). eval/noise-pca-whitened-level-2026-11-21.md
shipped `mpcw` as the Bayer default and found `mpcws` (the whitened read also selecting the patches) gains more
(held out +0.31 dB luma over Chen, white-balanced SNR 25 and 12 rows +0.67 dB, 0 losers) but failed the pick on
the tune split: 10 rows losing over 0.1 dB to directional against 6, all on `Pentax K-1 Mark II.pef` (ISO 1600,
30 s), whose raw-read grain (`truth_grain18`) passes `clean_enough` while `frame_noise` on its clean mosaic reads
2 to 4 times higher. Before `mpcws` can be judged, the sweep needs a way to tell whether that truth is noisy.

## Why the raw-read grain can miss a long exposure's noise

`truth_grain18` (`tools/truth_noise_check.py raw_grain`) reads the tile's noise at native resolution with patch
PCA, then scales it by the measured transfer of *white* noise through the truth pipeline (AHD, white balance,
4 x 4 binning). White noise falls by about 4 in a 4 x 4 bin. Noise correlated over a few sensels (a 30 s
exposure's dark current, banding, pattern noise, a raw converter's in-camera filtering) falls less, so a
native-resolution read scaled as if white can under-state the binned truth's grain. `frame_noise` on the clean
mosaic sees the binned grain but also reads texture as grain (D780 foliage 6 to 12 times,
eval/near-clean-truth-noise-2026-11-19.md), so it cannot be the judge either.

## A second reading: the two green sites, at the truth's own scale

Each 2 x 2 Bayer cell has two green sensels, one row and one column apart. Bin each green site separately over
the truth's 4 x 4 blocks (4 sensels each) and subtract: the scene cancels to within the one-sensel diagonal offset,
and what is left is the noise of a 4 x 4 block *as binned*, correlated or not (a common term shared by both sites,
such as smooth dark-current glow, cancels too, so this is still not every kind of noise). Per brightness bin of
the binned green, the robust spread (1.4826 x MAD about the bin's median, which also removes a fixed green-green
imbalance) of the difference, fitted as variance = a x level + b and read at the raw level the truth maps to 18%
grey. The same difference is taken of the white noise `raw_grain` already adds to measure its transfer, so the
reading is put in truth units by the ratio of the truth's response to that noise to the difference's: on white
noise the two readings agree by construction. Column: `truth_gg18`.

## What is asked, and what each answer decides (committed before `truth_gg18` was computed on any file)

Data: the 53 files of github.com/drewnoakes/metadata-extractor-images that the 2026-11-21 sweep scored (cards file
`eval/near-clean-gate-mei-cards-2026-11-19.json`, the same tiles), and that sweep's committed rows
(`noise-pca-whitened-level-2026-11-21.jsonl`, which carry `ship` = Chen, `mpcw` and `mpcws`, each `+12`), joined
with the new column by file and tile. raw.pixls.us refuses this session (CONNECT 403), so no fresh scene can be
added. The scored rows are not rerun: the new column only changes which rows count as clean.

**Is the reading valid? (decides whether it is used at all)**

- P1: on each of the K-1 Mark II's three tiles, `truth_gg18` is at least 1.5 times `truth_grain18`.
- P2: on the other files' tiles, the median `truth_gg18 / truth_grain18` is between 0.67 and 1.5; and on the
  textured tiles (`truth_sigma18 / truth_grain18` at least 3, where the frame read sees the scene) that median is
  at most 1.5, so the difference does not read texture as grain.

Either fails: the column is reported and kept as a reading, `clean_enough` is unchanged, `mpcws` stays opt-in.

**The noisy-truth rule (if P1 and P2 pass):** `clean_enough` takes the truth's noise as the larger of
`truth_grain18` and `truth_gg18` where both exist (each is an upper bound on a different part of the grain).

**Pick (tune, `--clean-truths` under that rule):** `mpcws+12` against what ships now, `mpcw+12`: a higher mean
(luma + colour) gain over `D`, and no more rows losing over 0.1 dB to `D` than `mpcw+12`.

**Test (held, same filter), `mpcws+12` against `mpcw+12`**, the 2026-11-21 bars: h1 mean luma and mean colour gain
each at least -0.005 dB, every (SNR, scenario) cell at least -0.02 dB; h2 no new row losing over 0.1 dB to `D`
and no more in all; h3 the white-balanced SNR 25 and 12 rows gain at least +0.02 dB luma.

Pick and test pass: `mpcws` becomes `frame_noise`'s Bayer default (X-Trans keeps Chen's read, untested).
Anything fails: defaults stay and this note says where.

**What this test cannot claim.** The held split is not blind: the 2026-11-21 note already reported `mpcws`
against Chen there (0 losers), and the new rule can only remove rows. Its weight here is that the rule is fixed,
with P1 and P2, before the column exists. A blind check stays open: raw.pixls.us's `first` set (the D780/D600
foliage rows) and any fresh body, when reachable.

## Result: the green-pair reading fails both validity tests; `mpcws` stays opt-in

The section above was committed (e5cae4f46) before the tool existed. A two-file smoke run of the finished tool
(the K-1 II and the NEX-5N) came before the full run, and its numbers (K-1 II 0.16 / 1.85 / 2.11, NEX-5N 4.34)
were seen; neither the method nor the bars changed after it.

`tools/truth_noise_check.py` (now writing `gg18` beside `raw_grain18`) on the 53 files: 67 tiles, 64 with both
readings (the two X-Trans RAFs have no green pair; the `raw_grain18` values match the committed sweep's on every
tile). 1 min 43 s on 4 cores. Output: `noise-pca-mpcws-noisy-truth-gg-2026-11-22.jsonl`; the test,
`python tools/near_clean_gate.py noisytruth <that file>`, in `noise-pca-mpcws-noisy-truth-2026-11-22.txt`.

| test | reading | bar | |
|---|---|---|---|
| P1, K-1 Mark II [0, 0] / [0, 1362] / [372, 678] | gg / grain 1.85 / 2.11 / **0.16** | each at least 1.5 | FAIL |
| P2, other tiles (n = 62) | median 2.11 (quartiles 1.42 to 3.88) | 0.67 to 1.5 | FAIL |
| P2, textured tiles (n = 5) | median 5.44 | at most 1.5 | FAIL |

So by the rule committed above the column is a reading only: `clean_enough` is unchanged, the pick and test were
not run under it, and `mpcws` stays opt-in (`eig="mpcws"`). The Bayer default stays `mpcw`.

**Why it failed (readings after the verdict; they decide nothing).**

- The calibration holds where the scene is flat: on the full-size frames whose frame read is at most 1.1 times the
  raw read (Sony A7 III, A7 IV, NEX-7, Nikon D800E, D810, 13 tiles), gg / grain is 0.96 to 1.27 on 11 and 1.54 to 1.74
  on 2. On the 3-tile (full-size) frames the median is 1.14, on the 1-tile (small) frames 2.60: a small frame puts
  more scene into each sensel, and the sites' one-sensel diagonal offset passes it into the difference. gg / grain
  rises with the frame read's own over-read (Spearman 0.56 with `truth_sigma18 / raw_grain18`, n = 62).
- K-1 II [372, 678] reads 0.16: the two green sites' noise is shared there (the 2 x 2-shared-noise case in
  `tests/test_truth_green_pair.py`, which the difference cancels). A raw that is filtered in camera, or a long
  exposure's noise common to neighbouring sensels, would do this; this note cannot say which.

**What the losing rows are, whatever the truth's noise (also after the verdict).** Had P1 and P2 passed, the rule
would have dropped 56 of the 162 tune rows, mostly by reading texture, and the pick would still have failed:
`mpcws+12` 6 losing rows against `mpcw+12`'s 2, all six on the K-1 II at SNR 12, which stays "clean" under either
reading (0.18 / 0.013 = 13.8 at least 12). And the reads themselves (sigma at 18% grey, the committed rows):

| K-1 II tile, SNR 25 / 12 (equal noise) | added | `raw_grain18` | `mpcw` | `mpcws` |
|---|---|---|---|---|
| [372, 678] | 0.0072 / 0.0150 | 0.0113 | 0.0146 / 0.0172 | 0.0299 / 0.0329 |
| [0, 0] | 0.0072 / 0.0150 | 0.0070 | 0.0262 / 0.0302 | 0.0229 / 0.0280 |
| [0, 1362] | 0.0072 / 0.0150 | 0.0066 | 0.0277 / 0.0302 | 0.0261 / 0.0283 |

On [372, 678] the truth's grain and the added noise together are about 0.013 at SNR 25 (sqrt(0.0072^2 + 0.0113^2)):
`mpcw` reads that, `mpcws` reads 2.3 times it. That is `mpcws`'s own fault: Liu's iteration keeps patches whose
texture energy is under `s2 x tr x q`, and with `SELECT_WITH` the `s2` is the whitened read itself, so a high read
loosens the threshold, keeps more texture and reads higher again. On the two other tiles (frame read 3.5 to 4 times
the raw grain: textured) both reads over-read about equally, 3 to 4 times the added noise at SNR 25; why `mpcws`
loses more there with a slightly lower read at 18% grey is not settled here (the blend takes the whole line, not
the 18% point).

## Next (for the flagship row)

`mpcws` with its feedback cut: select with `mpcw`'s level (one pass, not iterated on its own read), pre-registered
against `mpcw` on this sweep's tune and held splits, with the K-1 II [372, 678] over-read (`mpcws` / `mpcw` read at
most 1.3 there) as a stated check. The green-pair reading stays a tool for flat full-size frames only; it is not a
noisy-truth judge.

## What changed

- `tools/truth_noise_check.py`: `green_pair18` and the `gg18` column.
- `tools/near_clean_gate.py`: `noisytruth` (P1 and P2), `whitened --base` (the read to beat; `mpcw` since
  2026-11-21) and `--gg` (join `truth_gg18`; `clean_enough` takes the larger reading when it is joined).
- `tests/test_truth_green_pair.py`: white noise reads its own level, column-streak noise reads sqrt(2) above
  it, noise shared by both sites cancels, and a joined `truth_gg18` drops a row the raw read keeps.

## Reproduce

    git clone --filter=blob:none --no-checkout --depth 1 https://github.com/drewnoakes/metadata-extractor-images.git mei
    cd mei && git sparse-checkout set arw cr2 dng nef orf pef raf rw2 srw && cd -
    # the 53 files the 2026-11-21 sweep scored (its rows' "file" names)
    PYTHONPATH=src python tools/truth_noise_check.py --cache /tmp/truths FILES... > gg.jsonl
    python tools/near_clean_gate.py noisytruth gg.jsonl
    python tools/near_clean_gate.py whitened eval/noise-pca-whitened-level-2026-11-21.jsonl --split tune --base mpcw --eigs mpcws

Python 3.11.18, numpy 2.4.6, rawpy 0.28.0.
