# A texture-robust noise read: the smallest eigenvalue instead of Chen's prefix (2026-11-19)

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "next a texture-robust noise read for them,
pre-registered"). eval/near-clean-truth-noise-2026-11-19.md left 6 held-out Bayer rows (Nikon D780 DSC_0334,
0336, 0338 tile [0, 0]; Nikon D600 DSC_3294 tile [0, 1026]) that lose 0.11 to 0.18 dB to directional with the
lift on, on truths the raw says are clean, because what ships (`frame_noise`, patch PCA with Chen's eigenvalue
rule) reads the noise at 2.3 to 5.2 times what was added. On the clean mosaic, with nothing added, it reads almost
the same: the reading is the foliage.

## The idea

Patch PCA (`noise_pca.py`) picks weak-texture patches (Liu 2013), takes their 36 x 36 covariance and reads
sigma^2 as the mean of the longest ascending prefix of eigenvalues whose mean is no larger than its median (Chen
2015). Where texture fills most directions of the patch, that prefix holds texture eigenvalues and the mean rises.
The quietest direction holds the least texture. For white noise alone, the smallest sample eigenvalue of n
patches of dimension p sits near the lower Marchenko-Pastur edge, sigma^2 (1 - sqrt(p/n))^2, so dividing by that
edge reads sigma^2 without bias, and texture can raise it only by the texture's power in its quietest direction.

Two reads, both with no free parameter (the patch set is the one Chen's iteration keeps; only the final read
changes; under 4 x p patches in a bin, Chen's read is kept):

- `mp`: the smallest eigenvalue of the full 36-sample covariance over the Marchenko-Pastur edge.
- `mpc`: the same on each colour's own columns of the patch (9 red, 18 green, 9 blue), averaged by their
  share. On white-balanced noise the colours' variances differ, and `mp` alone would read the quietest colour.

On synthetic flat noise (480 x 480, a ramp, before any real tile was read) both read 0.81 to 0.98 of the added
sigma with equal noise, Chen 0.75 to 0.97; with white-balance gains (2.0, 1.0, 1.6), `mp` 0.47 to 0.61, `mpc`
0.48 to 0.87, Chen 0.40 to 0.60. So neither reads pure noise lower than what ships.

## What is asked, and what each answer decides (committed before any real row was scored)

Sweep: `tools/near_clean_gate.py sweep --bayer --ks 12 --eigs mp,mpc`, the shipped code otherwise unchanged,
same tiles, SNRs (200, 60, 25, 12), scenarios (equal, wb) and seeds as eval/near-clean-truth-noise-2026-11-19.md.
Rows are kept by `--clean-truths` (the raw's grain where it reads). Arms compared: `ship+12` (what ships),
`mp+12`, `mpc+12`.

**Pick, on the `fourth` set (raw.pixls.us, its cards file `eval/noise-card-floor-fourth-cards-2026-11-18.json`).**
Of `mp` and `mpc`, the one whose `+12` arm has the higher mean (luma + colour) gain over `D`, provided it has no
more rows losing over 0.1 dB to `D` than `ship+12`. If neither qualifies, stop: nothing changes in `src/`.

**Test, on the `first` set (the 83 kept files; none of it read for the pick), the picked read against `ship+12`:**

- h1: its mean luma and mean colour gain over `ship+12` are each at least -0.005 dB, and every (SNR, scenario)
  cell's mean at least -0.02 dB;
- h2: fewer rows lose over 0.1 dB to `D` than with `ship+12`, and no row loses that it did not;
- h3: on the 6 named rows, the mean of each row's worse of (luma, colour) gain over `D` is higher than with
  `ship+12`.

All three pass: the picked read becomes `frame_noise`'s default on Bayer (period 2; X-Trans keeps Chen's read,
since its losses were not tested here), with the README, NEXT.md and the flagship row updated. Any fails: nothing
changes in `src/` by default, the read stays an option (`eig=`), and the result says which hypothesis failed and
on which rows.

## Result

**The pick, as committed: stop.** On the `fourth` set (53 kept files, 696 rows, 556 with clean truths), what
ships has no row losing over 0.1 dB to `D`; `mp+12` has 1 and `mpc+12` has 4. So neither read qualifies and
nothing changes in `src/`. `eig="chen"` stays the default; `mp` and `mpc` stay as options.

| tune (`fourth`, clean truths, 556 rows) | luma over D | colour over D | rows losing > 0.1 dB | worst |
|---|---|---|---|---|
| `ship+12` (Chen) | +0.827 | +0.573 | 0 | -0.06 |
| `mp+12` | +0.775 | +0.543 | 1 | -0.14 |
| `mpc+12` | +0.918 | +0.617 | 4 | -0.42 |

**The held-out test, run anyway as a reading (it decides nothing, since the pick stopped).** The `first` set rerun
reproduces the committed `eval/near-clean-truth-noise-held-2026-11-19.jsonl` exactly: 1,272 rows, 0 differ in
`D`, `ship`, `ship+12` or `truth_grain18`. On the 958 clean-truth rows:

| held (`first`, clean truths, 958 rows) | luma over D | colour over D | losers | h1 | h2 | h3 (6 named rows) |
|---|---|---|---|---|---|---|
| `ship+12` | +0.696 | +0.480 | 6 | | | -0.135 |
| `mp+12` | +0.755 | +0.518 | 10 (4 new) | FAIL (SNR 12 equal cell -0.027) | FAIL | FAIL, -0.152 |
| `mpc+12` | +0.807 | +0.536 | 21 (15 new) | PASS | FAIL | FAIL, -0.350 |
| `true+12` (the oracle) | +1.018 | +0.484 | 2 | | | |

**Why it failed: the premise does not hold on these tiles.** On the six named rows the smallest-eigenvalue read
is not lower than Chen's. It is the same or higher (D780 DSC_0338 [0, 0] at SNR 60: Chen 0.0098, `mp` 0.0124,
`mpc` 0.0171, 0.0030 added). Two things show why, on D780 DSC_0336 [0, 0] at SNR 60:

- Foliage at the sampling limit fills every direction of the 36-sample patch, the quietest included. The bins'
  sigma reads 0.001 to 0.035 by Chen's rule against about 0.003 added, and the quietest eigenvalue carries the
  same excess.
- The weak-texture test keeps only 4,722 of 56,644 patches (8%), about 590 a bin. There the Marchenko-Pastur
  edge is (1 - sqrt(36/590))^2 = 0.57, so dividing by it multiplies what texture is left by 1.75. On white noise
  that division is right; on texture it amplifies the error. The sets are smallest exactly where texture is
  densest.

Across the tune rows the reads' ratio to the true sigma shows the same: at SNR 200, the 90th percentile is 2.94
(Chen), 3.32 (`mp`) and 4.30 (`mpc`).

**What the run found instead: the shipped read under-reads white-balanced noise.** `mpc`'s mean gain (+0.11 dB
luma over `ship+12` held out, +0.25 dB in the SNR 12 wb cell) comes from rows where Chen's read is too *low*:
with white-balance gains the colours' noise differs, Chen's prefix mean sits nearer the quieter colours, and on
the held SNR 12 rows it reads a median 0.53 of the true sigma with white balance against 0.75 without (`mpc`
0.59 and 0.78). The oracle's +1.02 dB luma against what ships at +0.70 dB is the size of that gap. But reading
higher everywhere, as `mpc` does, also reads the foliage higher, and that is where its 15 new losers are. The two
faults pull in opposite directions, so one global read cannot fix both. A fix has to read the colour ratio and the
texture apart. Next items (NEXT.md):

1. Per-colour noise read with a texture-safe level: take the colours' noise *ratios* from `mpc` (texture is
   common to the colours, so the ratio is less affected than the level) and the *level* from Chen's read of the
   colour-whitened patches. Pre-register it on the `fourth` set.
2. The over-read on dense foliage is not in the eigenvalues. The bins' sigma climbs with level on the D780 tile
   (0.001 dark to 0.035 bright), steeper than shot noise allows, so a line fit that is a lower envelope of the
   bins (or caps a bin at what the darker bins' line predicts) is the next lever there.

## What changed

- `src/shootflow/noise_pca.py`: `eig=` on `estimate_noise_pca`, `pca_bins`, `_weak_texture_idx` and
  `_eig_sigma2_idx` (`EIG_READS`: "chen", the default, unchanged; "mp"; "mpc"); `_mp_floor`. The patch set is
  chosen by Chen's read whatever `eig` is.
- `src/shootflow/xtrans_demosaic.py`: `frame_noise(..., eig=)` passes it on. Default output is unchanged: the
  `ship` arm here equals the committed rows to the last digit.
- `tools/near_clean_gate.py`: `sweep --eigs` scores further reads as arms and records each arm's `sigma18` and
  the true model's `true_sigma18`; `pick` and `compare` are this file's rule and test, as committed.
- `tests/test_noise_pca.py`: `mp` reads white noise and drops texture spread over 30 of 36 directions; `mpc`
  reads the colours' mean variance where `mp` reads the quietest colour.
- Rows: `noise-pca-min-eigen-tune-2026-11-19.jsonl` (696), `noise-pca-min-eigen-held-2026-11-19.jsonl` (1,272);
  printed output: `noise-pca-min-eigen-2026-11-19.txt`.

## Reproduce

    python tools/pixls_fetch.py eval/noise-card-floor-files-2026-11-18.json --set fourth --out /tmp/raws4 > m4.json
    python tools/pixls_fetch.py eval/noise-card-floor-files-2026-11-18.json --set first --out /tmp/raws1 > m1.json
    # kept files of each set by its cards file, as eval/near-clean-truth-noise-2026-11-19.md lists them, then:
    tr '\n' '\0' < kept4.txt | PYTHONPATH=src xargs -0 -P 4 -n 1 python tools/near_clean_gate.py sweep --bayer --ks 12 \
        --eigs mp,mpc --cards eval/noise-card-floor-fourth-cards-2026-11-18.json --cache /tmp/truths > tune.jsonl
    python tools/near_clean_gate.py pick tune.jsonl --clean-truths
    # the same sweep on kept1.txt with eval/noise-card-floor-cards-2026-11-18.json > held.jsonl, then
    python tools/near_clean_gate.py compare held.jsonl --eig mp --clean-truths   # and --eig mpc

(Python 3.13, numpy 2.5.3, rawpy 0.28, 4 cores; the tune sweep about 7 minutes and the held one about 8, with the
raw fetch, 5.5 GB in all, the slowest part.)
