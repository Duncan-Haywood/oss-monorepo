# White-balanced noise read at its level: colour ratios, then Chen on whitened patches (2026-11-21)

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "next per-colour ratios with a texture-safe level,
pre-registered"; NEXT.md, "From the min-eigenvalue noise read"). eval/noise-pca-min-eigen-2026-11-19.md found
that what ships (`frame_noise`, patch PCA with Chen's eigenvalue rule) reads white-balanced noise low: a median
0.53 of the true sigma at SNR 12 with white balance against 0.75 without, held out, and the oracle model gains
+1.02 dB luma over directional against +0.70 for what ships. Reading higher everywhere (`mpc`) also read foliage
higher and added 15 held-out losers. The suggested fix: take the colours' noise *ratios* from `mpc` and the
*level* from Chen's read of the colour-whitened patches.

## The reads

Both new reads leave the patch extraction, the texture test's matrix and the line fit alone. In each brightness
bin, with the kept patches' 36 x 36 covariance C:

- per-colour variance v_k: the smallest eigenvalue of colour k's own block of C over its Marchenko-Pastur edge
  (what `mpc` already reads per colour);
- ratio r_k = v_k / mean(v), the mean over the three colours with equal weight (that is how
  `tools/noise_aware_planes.carries` puts white-balanced noise into the one model the blend takes, and so what
  the sweep's true model is);
- level: Chen's prefix read of W C W, W = diag(1 / sqrt(r_k)) on colour k's columns. Pure noise there has
  variance mean(v) in every column; texture that fills the quietest direction is not divided by the
  Marchenko-Pastur edge, which was `mp`/`mpc`'s fault on foliage.

`mpcw`: the patch set is the one Chen's iteration keeps (as for `mp` and `mpc`); only the final read changes.
`mpcws`: the whitened read also drives Liu's iteration (`SELECT_WITH`), because the iteration's threshold
(s2 x tr x q) uses the read itself: with Chen's low read it trims the noisier tail of pure-noise patches.

Synthetic check before any real row (480 x 480 ramp 0.05 to 0.6, shot 80% / read 20% of the variance at 18%
grey, gains 2.0 / 1.0 / 1.6 for "wb"; `frame_noise(..., scale=1.0)`, read over true sigma at 18% grey):

| SNR | scenario | chen | mpc | mpcw | mpcws |
|---|---|---|---|---|---|
| 200 | equal | 0.87 | 0.92 | 0.87 | 0.92 |
| 200 | wb | 0.63 | 0.73 | 0.74 | 0.69 |
| 60 | equal | 0.95 | 0.94 | 0.94 | 0.95 |
| 60 | wb | 0.64 | 0.67 | 0.69 | 0.97 |
| 25 | equal | 0.97 | 0.98 | 0.97 | 0.97 |
| 25 | wb | 0.73 | 0.77 | 0.81 | 0.97 |
| 12 | equal | 0.98 | 0.98 | 0.98 | 0.98 |
| 12 | wb | 0.73 | 0.77 | 0.83 | 0.98 |

So most of the white-balance under-read is the selection, not the eigenvalue rule: `mpcw` closes a fifth of the
gap, `mpcws` all of it from SNR 60 down. Equal-noise reads are unchanged.

## Data

raw.pixls.us refuses this session (`403 ... no rule or network setting allows this host`), so the `fourth` and
`first` sets the 2026-11-19 note named cannot be fetched. As eval/near-clean-gate-xtrans-tune-2026-11-19.md did,
the scenes are the 60 raws of github.com/drewnoakes/metadata-extractor-images, its cards file
`eval/near-clean-gate-mei-cards-2026-11-19.json` and the sweep's own body split (`split_of`: tune / held). No
eigenvalue read other than Chen's has been scored on these files. Bayer layout (RGGB), k 12 (what ships), the
sweep's tiles, SNRs, scenarios and seeds unchanged; `--clean-truths` throughout.

## What is asked, and what each answer decides (committed before any real row was scored)

Sweep: `tools/near_clean_gate.py sweep --bayer --ks 12 --eigs mpcw,mpcws` on the 60 files.

**Pick (`whitened --split tune`).** Of `mpcw` and `mpcws`, the `+12` arm with the higher mean (luma + colour)
gain over `D`, provided that mean is higher than `ship+12`'s and it has no more rows losing over 0.1 dB to `D`
than `ship+12`. If neither qualifies, stop: nothing changes in `src/`'s defaults.

**Test (`whitened --split held --eig <pick>`), the picked arm against `ship+12`:**

- h1: mean luma and mean colour gain over `ship+12` each at least -0.005 dB, every (SNR, scenario) cell's mean at
  least -0.02 dB;
- h2: no row loses over 0.1 dB to `D` that did not with `ship+12`, and no more such rows in all (the 2026-11-19
  "fewer" cannot be asked here: on this set what ships has no such row on clean truths);
- h3: on the white-balanced rows at SNR 25 and 12, the cells where the under-read sits, the mean luma gain over
  `ship+12` is at least +0.02 dB.

All three pass: the picked read becomes `frame_noise`'s default on Bayer (period 2; X-Trans keeps Chen's read,
untested here), with README, NEXT.md and the flagship row updated. Any fails: defaults stay, the reads stay
options (`eig=`), and this note says which hypothesis failed and on which rows. A rerun on raw.pixls.us's
`first` set (the 6 named D780/D600 foliage rows) stays open either way.

## Result

(to be filled from the sweep's output, `noise-pca-whitened-level-2026-11-21.txt`)
