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

(filled in after the runs)
