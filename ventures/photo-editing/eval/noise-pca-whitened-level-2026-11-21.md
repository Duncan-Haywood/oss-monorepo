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

## Result: `mpcw` ships on Bayer; `mpcws` gains more but failed the pick

Sweep: 60 files, 7 skipped as on 2026-11-19 (LibRaw cannot open `Issue 247-1..4.nef`, `bigtiff*.dng`,
`Issue 419.rw2`), 536 rows; with `--clean-truths` 162 tune rows and 208 held. Output:
`noise-pca-whitened-level-2026-11-21.txt`, rows `noise-pca-whitened-level-2026-11-21.jsonl`.

**Pick (tune, 162 rows): `mpcw`.**

| arm | luma over D | colour over D | rows losing > 0.1 dB | worst |
|---|---|---|---|---|
| `ship+12` (Chen) | +0.566 | +0.361 | 6 | -0.75 |
| `mpcw+12` | +0.640 | +0.392 | 6 | -0.81 |
| `mpcws+12` | +0.856 | +0.434 | 10 | -1.08 |

A correction to the rule's h2 note: what ships *does* have losing rows on this set's tune split (6, below);
the 2026-11-19 "none" was on the 352 rows kept by `truth_sigma18` alone, before `truth_grain18` was joined. The
rule's wording (no new loser, no more in all) is unaffected.

`mpcws` has the higher gain but 10 losers against 6, so it does not qualify; `mpcw` does (+1.032 against +0.927
luma + colour, 6 losers). All 10 losing rows are on one file, `Pentax K-1 Mark II.pef` (tiles [0, 0], [0, 1362],
[372, 678]; SNR 25 and 12), the ISO 1600, 30 s frame eval/near-clean-gate-xtrans-tune-2026-11-19.md found to have a
noisy truth: its raw-read grain (`truth_grain18`, 0.0066 to 0.011) passes `clean_enough`, while the frame read of
the clean mosaic is 0.011 to 0.027. Where `ship` already loses there, `mpcws` loses more (to -1.08 dB).

**Test (held, 208 rows), `mpcw+12` against `ship+12`: h1, h2 and h3 all pass.**

| (SNR, scenario) | n | luma over `ship+12` | colour |
|---|---|---|---|
| 200 equal / wb | 6 / 6 | +0.012 / +0.050 | +0.008 / +0.025 |
| 60 equal / wb | 30 / 30 | +0.029 / +0.094 | +0.009 / +0.038 |
| 25 equal / wb | 32 / 32 | +0.016 / +0.153 | +0.003 / +0.062 |
| 12 equal / wb | 36 / 36 | +0.018 / +0.268 | +0.006 / +0.113 |

- h1 PASS: means +0.095 luma, +0.038 colour; the lowest cell +0.003.
- h2 PASS: 0 losers with either (worst row -0.01 dB), none new.
- h3 PASS: the white-balanced SNR 25 and 12 rows gain +0.214 dB luma (n = 68; bar +0.02).

Read over true sigma at 18% grey (median, held): with white balance 0.62 (Chen) to 0.73 (`mpcw`) at SNR 60, 0.56
to 0.61 at 25, 0.52 to 0.62 at 12; equal noise moves by 0.01 to 0.03. So `frame_noise`'s default eigenvalue read
on Bayer is now `mpcw` (`eig=None`: `"mpcw"` on period 2, `"chen"` on X-Trans). `eig="chen"` gives the old model.

**`mpcws` held out, a reading only (it decides nothing):** +0.306 luma and +0.079 colour over `ship+12`, the
white-balanced SNR 25 and 12 rows +0.668 dB, 0 losers, every cell at least -0.001. It would have passed every test
hypothesis. It reads closer to the true level (0.78 to 0.89 of true at SNR 60 to 12 with white balance on the tune rows,
against 0.53 to 0.63 for Chen), so most of the under-read was the selection, as the synthetic table said. Its only
fault on this set is the one noisy-truth file. That makes it the next item, pre-registered as a new rule that names
how noisy truths are judged before it is scored (and on raw.pixls.us's `first` set when reachable).

**Reproducibility.** The rerun's `D` arm matches the committed `near-clean-gate-mei-bayer-2026-11-19.jsonl` on all
536 rows; `ship` matches on 532. The 4 that differ (`FujiFilm EX-2.raf` [168, 372] three rows, up to -0.33 dB; one
`Fujifilm X-E1.raf` row, 0.02 dB) come out the same with main's `noise_pca.py` and with this branch's (0 of 8 EX-2
rows differ), so the drift came in with a change after the 2026-11-19 rows and not with this one.

## What changed

- `src/shootflow/noise_pca.py`: reads `"mpcw"` and `"mpcws"` (`_colour_whitening`, `_chen`, `SELECT_WITH`); the
  per-colour columns are built for them as for `"mpc"`.
- `src/shootflow/xtrans_demosaic.py`: `frame_noise(..., eig=None)`: `"mpcw"` on Bayer, `"chen"` on X-Trans.
- `tools/near_clean_gate.py`: `whitened` (this note's pick and test); `--eigs` takes the new reads.
- Tests: `tests/test_noise_pca.py` (`mpcw` reads the colours' mean where Chen reads low; `mpcws` reaches the true
  level on a white-balanced ramp where Chen reads under 0.85), `tests/test_near_clean_gate_split.py` (pick and test
  on hand-made rows).

## Reproduce

    git clone --filter=blob:none --no-checkout --depth 1 https://github.com/drewnoakes/metadata-extractor-images.git mei
    cd mei && git sparse-checkout set arw cr2 dng nef orf pef raf rw2 srw && cd -
    find mei -type f -not -path '*/.git/*' -print0 | PYTHONPATH=src xargs -0 -P 4 -n 1 python tools/near_clean_gate.py \
        sweep --bayer --ks 12 --eigs mpcw,mpcws --cards eval/near-clean-gate-mei-cards-2026-11-19.json --cache /tmp/truths > rows.jsonl
    python tools/near_clean_gate.py whitened rows.jsonl --split tune
    python tools/near_clean_gate.py whitened rows.jsonl --split held --eig mpcw

Run with the branch's code *before* the default changed (or pass `eig="chen"`): after it, the `ship` arm is
`mpcw`. Python 3.13, numpy 2.5.3, rawpy 0.28; the sweep took about 35 minutes on 4 cores with 1.9 GB of raws.
