# Should `--demosaic auto` pick noise-aware? (2026-11-19)

**Verdict: yes, shipped. All five tests below pass, so `--demosaic auto` (the default) now picks noise-aware
wherever it picked directional: Bayer at full size and X-Trans at full and half size, numpy engine.
`--demosaic directional` gives the old default.** The cost is 1.34x directional's time (median of 53 real raws
from 49 bodies; 0.062 s per megapixel added) and 1.015x its added peak memory (none over 1.21x). The quality case
rests on 6,008 rows earlier runs already scored: noise-aware is ahead of directional on average in all 24
set x SNR x scenario cells, and 0.78% of rows lose over 0.1 dB, all near clean. It also turned up a crash: a frame
under 24 sensels in one dimension (and wider in the other) failed in `_block_stat`, so `--demosaic noise-aware`
failed on it too. Fixed below.


Flagship item (portfolio/flagships.yaml photo-editing `next:`, "whether `auto` should pick noise-aware"). On
2026-11-17 noise-aware stayed opt-in because it took 5.8x directional's time and up to 6.4 GB on a 36 MP frame
(eval/noise-fallback-real-2026-11-17.md). Six speed and memory changes since then (float32 bilinear, the guard's
statistics, the blend, the block levels and the patch PCA in C) report it at 1.26x directional's time
(eval/noise-pca-native-2026-11-19.md). None of those notes put the two demosaics' peak memory side by side.

## Decision rule, committed before any cost row was measured

**Quality** (rows already scored by earlier runs; seen before this rule, so this half is a summary, not a test):
`pcaguard@0.8`, what `--demosaic noise-aware` ships for a raw with no NoiseProfile, against `D` (directional) in
the three raw.pixls.us sweeps of 2026-11-18 (`noise-card-floor-cap-`, `-fresh-cap-`, `-fourth-cap-2026-11-18.jsonl`;
real scenes binned 4 x 4 into truths, noise added at SNR 12, 25, 60 and 200, `equal` and `wb` scenarios). It
passes if (q1) mean luma and mean colour gain are positive in every set x SNR x scenario cell, (q2) at most 1% of
rows lose over 0.1 dB in either metric, and (q3) at SNR 200, rows gaining over 0.1 dB luma outnumber rows losing
over 0.1 dB at least 5 to 1.

**Cost** (measured after this rule is committed, with `tools/noise_aware_cost.py --peaks` on the public sample raws
of drewnoakes/metadata-extractor-images, full size, numpy engine, C helpers built, two files at a time):
(c1) median time noise-aware / directional at most 1.5x and median added time at most 0.1 s per MP;
(c2) median added peak memory noise-aware / directional at most 1.5x, and no file over 2x.

If all five hold, `auto` picks noise-aware wherever it now picks directional (full size, numpy engine; X-Trans
half size too, which demosaics at full size), and `--demosaic directional` keeps the old default. If any fails,
`auto` stays directional and this note names the one that failed.

## Results

`python tools/auto_noise_aware_rule.py --quality eval/noise-card-floor-cap-2026-11-18.jsonl
eval/noise-card-floor-fresh-cap-2026-11-18.jsonl eval/noise-card-floor-fourth-cap-2026-11-18.jsonl --cost
eval/auto-noise-aware-cost-2026-11-19.jsonl`:

    PASS  q1 mean luma and colour gain > 0 in every set x SNR x scenario cell: 24 cells, lowest cell mean +0.026 dB
    PASS  q2 at most 1% of rows lose over 0.1 dB: 47 of 6008 (0.78%); per set noise-card-floor-cap-2026-11-18.jsonl: 18 of 1272 (1.42%), noise-card-floor-fourth-cap-2026-11-18.jsonl: 5 of 696 (0.72%), noise-card-floor-fresh-cap-2026-11-18.jsonl: 24 of 4040 (0.59%)
    PASS  q3 at SNR 200, wins over 0.1 dB luma >= 5x losses over 0.1 dB: 279 wins, 29 losses (9.6 to 1)
    PASS  c1 median time <= 1.5x directional and added time <= 0.1 s per MP: 53 files, 1.34x, 0.062 s per MP
    PASS  c2 median added peak <= 1.5x directional's, none over 2x: median 1.015x, max 1.213x
    verdict: auto picks noise-aware

**A caveat on q2.** The rule says "1% of rows" without saying pooled or per set. Pooled it is 0.78%. The first
set alone (1,272 rows, 29 bodies) is 1.42%. That set had more near-clean frames whose own fine texture reads as
noise (eval/noise-card-floor-real-2026-11-18.md). The rule was read as pooled. Read per set, q2 fails on one set
of three.

Mean luma gain over directional, per set and scenario (from the same rows): +0.78 to +1.32 dB at SNR 12,
falling to +0.07 to +0.23 dB at SNR 200. Colour gains are smaller and positive everywhere. The worst row is
-0.58 dB, the Pentax K-3 Mark III tile where the true noise model loses as much
(eval/noise-card-floor-rank-2026-11-18.md). That is the blend's ramp near clean, still open.

### Cost, per file

53 of the 60 sample raws develop. The 7 that do not fail in `read_raw` before any demosaic, the same files as
on 2026-11-17: two BigTIFF DNGs, four "Issue 247" NEFs with no TIFF header and a truncated RW2. Every one of the
53 used noise-aware. 52 used a model read from the frame, and the LG Nexus 5X used its NoiseProfile. All six Bayer
phases and both X-Trans layouts are covered. Rows: `auto-noise-aware-cost-2026-11-19.jsonl`.

| file | MP | CFA | directional s | noise-aware s | ratio | added peak GB, directional | noise-aware | ratio |
|---|---|---|---|---|---|---|---|---|
| nef/Nikon D810.nef | 36.4 | RGGB | 6.46 | 7.98 | 1.24x | 2.00 | 1.97 | 0.98x |
| nef/Nikon 800E.nef | 36.3 | RGGB | 5.82 | 7.43 | 1.28x | 2.00 | 1.97 | 0.98x |
| pef/Pentax K-1 Mark II.pef | 36.1 | RGGB | 6.00 | 7.93 | 1.32x | 2.01 | 1.98 | 0.98x |
| arw/Sony ILCE-7M4 (A7M4).ARW | 32.7 | RGGB | 24.10 | 23.55 | 0.98x | 2.09 | 2.09 | 1.00x |
| srw/Samsung NX1.srw | 28.0 | GRBG | 4.70 | 6.57 | 1.40x | 1.55 | 1.58 | 1.02x |
| arw/Sony NEX-7.arw | 24.3 | RGGB | 4.33 | 5.69 | 1.31x | 1.34 | 1.39 | 1.04x |
| cr2/Canon EOS 70D.cr2 | 20.0 | RGGB | 3.48 | 4.62 | 1.33x | 1.10 | 1.18 | 1.07x |
| raf/FujiFilm EX-2.raf | 16.0 | X-Trans | 4.37 | 6.61 | 1.51x | 1.50 | 1.18 | 0.78x |
| raf/Fujifilm X-E1.raf | 16.0 | X-Trans | 4.71 | 5.81 | 1.23x | 1.53 | 1.20 | 0.78x |
| dng/LG Nexus 5X.dng | 12.1 | RGGB | 2.40 | 5.22 | 2.17x | 0.77 | 0.93 | 1.21x |
| nef/Nikon D70.nef | 6.1 | BGGR | 0.76 | 1.77 | 2.33x | 0.52 | 0.52 | 1.00x |

(11 of 53 rows: the five largest, the two X-Trans files, the two slowest ratios, the Nexus 5X (the one
NoiseProfile) and the 70D; every row is in the JSONL.)

- **Time.** Each file was developed once per arm, two files at a time on 4 cores, so single ratios are noisy:
  five files came out faster with noise-aware (0.67x-0.98x), which cannot be true. The median is the number to
  read. The added time is roughly fixed per frame, so small old files show the largest ratios (D70 6 MP, 2.33x,
  +1.0 s). The Sony ARWs with in-file lens tables (A5000, A7 III, A7 IV) spend 12-24 s in the lens warp in both
  arms. The first three rows (DSLR-A500, A5000, A7 III) ran while the C helpers were still compiling after a
  container restart, so they were timed again once the helpers were built; the JSONL has the second timing.
- **Memory.** Noise-aware's added peak is within 10% of directional's on 49 of 53 files. On the two X-Trans files it is 22%
  lower. The cause was not looked for. The noise-aware path keeps its bilinear image in float32 and blends into
  it in place (eval/noise-aware-float32-2026-11-17.md), which is one likely reason. The Nexus 5X (+21%) is the only file with a NoiseProfile, so its guard runs per
  colour plane (`guard_profile`), which the frame-read path does not.

## The crash it found

The test suite was run with `auto` switched before any of this was committed, and 27 tests failed. Four asserted
that `auto` means directional. The other 23 were one bug: `xtrans_demosaic._block_stat` took a frame under one
24-sensel block in one dimension but not the other as `hb = 1, wb = w // 24` blocks of the whole frame's size,
and the reshape failed (`cannot reshape array of size 384 into shape (1,8,2,48)`). The C path
(`noise_native.block_mean_max`) already hands such frames to numpy as one block, and `_block_detail` takes
them as one block. `_block_stat` now does the same. Any frame that thin with `--demosaic noise-aware` failed
before this. No real raw is that thin, but crops and the tests' synthetic frames are.

## What changed

- `src/shootflow/raw_develop.py`: `_demosaic_method`'s `auto` returns `noise-aware` with the numpy engine.
  The exception is Bayer at half size, which bins and demosaics nothing, so it still reports directional and
  reads no noise. With `--no-noise-from-frame` and no NoiseProfile, `auto` falls back to directional with a
  note, as `--demosaic noise-aware` already did.
- `src/shootflow/xtrans_demosaic.py`: `_block_stat` takes any frame under one block in either dimension as one
  block.
- `src/shootflow/cli.py`: `--demosaic` help.
- `tools/noise_aware_cost.py --peaks`: also records directional's own added peak, in a second, traced run.
- `tools/auto_noise_aware_rule.py`: this note's rule, applied to the rows.
- Tests: `auto` is noise-aware on Bayer and X-Trans (full and half), equals explicit `noise-aware`, and Bayer
  half size reads no noise (`tests/test_bayer_demosaic.py`, `tests/test_xtrans_demosaic.py`); thin frames are
  one block, and noise-aware runs on 18 x 60 Bayer and X-Trans frames (`tests/test_demosaic_noise_aware.py`).

## What it does not settle

- The near-clean losses. 0.78% of rows lose over 0.1 dB, worst -0.58 dB, and on the worst the oracle loses too.
  A gate in the blend's ramps near clean is the next step there (eval/noise-card-floor-rank-2026-11-18.md).
- No row here is a real high-ISO frame against a clean reference. The quality rows add synthetic noise to binned
  real scenes. A real low- and high-ISO pair of one static scene is still the missing evidence (NEXT.md).
- Every output changes. Anyone who wants yesterday's bytes passes `--demosaic directional`.

## Reproduce

    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set arw cr2 nef orf rw2 srw raf pef dng)
    (cd mei && find arw cr2 nef orf rw2 srw raf pef dng -type f ! -path '*metadata*' ! -name '*.txt' | sort) > all.txt
    (cd mei && tr '\n' '\0' < ../all.txt | PYTHONPATH=../src xargs -0 -P 2 -n 1 python ../tools/noise_aware_cost.py --peaks) > cost.jsonl
    python tools/auto_noise_aware_rule.py --quality eval/noise-card-floor-cap-2026-11-18.jsonl \
        eval/noise-card-floor-fresh-cap-2026-11-18.jsonl eval/noise-card-floor-fourth-cap-2026-11-18.jsonl --cost cost.jsonl

(Python 3.13, numpy 2.5.3, gcc for the C helpers; about 45 minutes at two files at a time.)
