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
