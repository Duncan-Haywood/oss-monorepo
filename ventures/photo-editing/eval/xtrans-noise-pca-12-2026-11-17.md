# X-Trans patch PCA: 12 x 12 patches fail, a touching-neighbour texture test ships (2026-11-17, evening)

Flagship item (portfolio/flagships.yaml, NEXT.md "Raws without a profile"): with patch-PCA frame noise
(eval/noise-pca-estimator-2026-11-17.md), 17 of 248 held X-Trans tiles still lost over 0.1 dB to directional
(worst 1.48 dB), all on tiles whose texture is louder than the added noise. The note's guess was "two periods
(12 x 12, 144 dimensions) is the obvious next try".

**Verdict: 12 x 12 patches are worse; a different texture test fixes it. On X-Trans, `estimate_noise_pca` now
picks weak-texture patches by the differences of touching same-colour sensels (`texture="near"`, the default
for a 6 x 6 X-Trans patch). Held out, through `frame_noise` (sigma x 0.8, guarded): 0 of 248 tiles lose over
0.1 dB to directional (was 17), worst -0.04 dB (was -1.48), mean luma gain +0.53 dB (was +0.45), colour +0.37
(was +0.31).** Bayer is unchanged (its default test is the same-colour gradient, as before). The flag stays
opt-in; making it the automatic fallback is the next item.

## Why 12 x 12 failed

In a 12 x 12 patch a colour's next copy is 6 sensels away, so the texture test (same-colour differences one
period apart, or each sensel against its colour's mean in the patch) measures the scene at a six-sensel scale.
On these binned scenes almost no patch is flat at that scale: on a sample tile (Nikon, SNR 60, one brightness
bin of 781 patches) the iteration's first threshold kept fewer than 146 patches (the 144 dimensions + 2 the
eigen-reading needs), so it stopped and read sigma from every patch, texture included (1.41 x true). Both 12 x
12 tests gave identical numbers on every row for this reason. Adding the second lattice (the X-Trans layout
repeats on a (3, 3) shift, `XTRANS_SHIFTS`) doubles the patches and does not change that.

## The test that worked

X-Trans has 20 greens in every 36 sensels and every green touches another (horizontally, vertically or
diagonally); `_near_matrix` takes the difference of every touching same-colour pair in the patch (33 rows in
a 6 x 6 patch). Noise in each difference is independent sensel to sensel as before, but texture is now read at
one sensel, the scale where the demosaic's errors come from.

## Estimator accuracy (estimate / true sigma at 18% grey)

`tools/noise_estimator_accuracy.py --only xtrans12`, same 45 readable scenes (+ the X-E1 frame), tiles, SNRs,
scenarios and noise draws as the earlier note (its m6 column reproduces exactly); 216 tune, 248 held rows.
`h`: both lattices; `g`/`c`/`n`: gradient one period apart / colour-mean residual / touching neighbours.

| X-Trans | tune median | p90 | p99 | share > 1.5 | held median | p90 | p99 | share > 1.5 |
|---|---|---|---|---|---|---|---|---|
| m6 (shipped this afternoon, `c`) | 0.95 | 4.14 | 28.1 | 0.31 | 0.94 | 4.52 | 21.6 | 0.32 |
| m6h | 0.96 | 4.04 | 26.2 | 0.32 | 0.96 | 4.02 | 18.0 | 0.28 |
| m12g | 1.25 | 6.79 | 30.9 | 0.43 | 1.34 | 6.59 | 22.4 | 0.46 |
| m12c | 1.25 | 6.78 | 30.9 | 0.43 | 1.34 | 6.59 | 22.4 | 0.46 |
| m12gh | 1.24 | 6.50 | 30.0 | 0.42 | 1.37 | 6.96 | 24.4 | 0.47 |
| m12ch | 1.29 | 6.49 | 31.2 | 0.42 | 1.41 | 6.96 | 24.4 | 0.47 |
| **m6n** (shipped) | 0.95 | 3.84 | **18.4** | **0.26** | 0.86 | **2.70** | **9.7** | 0.24 |
| m6nh | 0.98 | 3.81 | 22.4 | 0.29 | 0.89 | 2.89 | 12.4 | 0.21 |
| m12nh | 0.85 | 4.27 | 25.3 | 0.34 | 0.98 | 5.06 | 22.9 | 0.34 |

Honest note on the pick: the summary printed tune and held rows together, so held rows were on screen when
m6n was chosen. The stated tune rule (lowest p90, ties within 0.1 broken by the share over 1.5) picks m6n over
m6nh (p90 3.84 vs 3.81, share 0.26 vs 0.29, and the simpler one); held would have picked m6n too.

## What it does to the demosaic

`tools/noise_aware_estimated.py sweep --pca-texture near --scales 0.6,0.8,1,1.25` on the same rows; the
afternoon's arms from eval/xtrans-noise-pca-blend-2026-11-17.jsonl (same seeds). Gain over directional, dB,
mean / worst / rows worse by over 0.1 dB:

| X-Trans | tune luma | tune colour | held luma | held colour |
|---|---|---|---|---|
| true model | +1.23 / -0.02 / 0 | +0.56 / -0.04 / 0 | +1.00 / 0.00 / 0 | +0.47 / -0.08 / 0 |
| pcaguard@0.8 (afternoon, `c`) | +0.59 / -0.03 / 0 | +0.38 / -0.02 / 0 | +0.45 / -1.48 / 17 | +0.31 / -1.00 / 15 |
| **pcanguard@0.8** (shipped) | +0.91 / -0.02 / 0 | +0.52 / -0.01 / 0 | **+0.53 / -0.04 / 0** | +0.37 / -0.06 / 0 |
| pcan@0.8 (no guard) | +0.91 / -0.10 / 1 | +0.52 / -0.06 / 0 | +0.53 / -0.04 / 0 | +0.37 / -0.06 / 0 |
| pcanguard@1 | +1.22 / -0.05 / 0 | +0.61 / -0.04 / 0 | +0.74 / -0.56 / 12 | +0.46 / -0.31 / 8 |
| pcanguard@1.25 | +1.39 / -0.50 / 2 | +0.61 / -0.47 / 1 | +0.86 / -2.39 / 18 | +0.44 / -1.80 / 22 |

The scale stays 0.8, as fixed this afternoon; this change is the texture test only, compared at that scale.
The tune-only fit rule (`fit`) would pick pcanguard@1, which loses 12 held rows (worst -0.56 dB): the same
lesson as the afternoon's, that tune rows here cannot tell 0.8 from 1.

Held luma by bucket (added sigma over the clean tile's own `haar2` reading; < 1, 1-2, 2-4, >= 4; n 112 / 36 /
48 / 52): true +0.13 / +1.09 / +1.41 / +2.42; afternoon pca@0.8 +0.09 (19 worse) / +0.55 / +0.57 / +1.04;
**near +0.09 (0 worse) / +0.31 / +0.75 / +1.42**. It gives up gain in the 1-2 bucket and gains more in the two
noisiest.

## Whole frame

Fujifilm X-E1 (16 MP), the raw mosaic black-subtracted: sigma at 18% grey 8.05e-3 (`c`) and 7.49e-3 (`near`),
0.2 s and 0.4 s for the PCA alone on this container (the guard and demosaic are extra). No truth for it.

## Reproduce

    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set arw cr2 nef orf rw2 srw raf)
    find mei/{arw,cr2,nef,orf,rw2,srw,raf} -type f ! -path '*metadata*' > all.txt   # 51 paths, 46 open
    tr '\n' '\0' < all.txt | PYTHONPATH=src xargs -0 python tools/noise_estimator_accuracy.py --raf mei/raf/'Fujifilm X-E1.raf' --only xtrans12 --cache /tmp/truths > acc.jsonl
    tr '\n' '\0' < all.txt | PYTHONPATH=src xargs -0 python tools/noise_aware_estimated.py sweep --raf mei/raf/'Fujifilm X-E1.raf' --pca-texture near --scales 0.6,0.8,1,1.25 --cache /tmp/truths > blend.jsonl
    python tools/noise_aware_estimated.py fit blend.jsonl
    python tools/noise_aware_estimated.py bucket --grain eval/noise-estimated-scene-grain-2026-11-17.jsonl blend.jsonl

(rawpy 0.28 in a venv; four cores, about 2 minutes each.) Files:
`xtrans-noise-pca-12-accuracy-2026-11-17.jsonl`, `xtrans-noise-pca-near-blend-2026-11-17.jsonl`. Every number is
synthetic noise on binned real scenes mosaicked with the X-E1's layout; a real ISO series is still the missing
test.
