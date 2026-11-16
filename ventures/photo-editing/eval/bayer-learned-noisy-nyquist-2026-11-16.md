# Learned Bayer weight: trained on noisy mosaics, and a near-Nyquist try that made the sheet worse (2026-11-16)

Flagship item (BUILDABLE HERE): "Bayer learned: next noisy and near-Nyquist training
(eval/bayer-learned-laplace-*)". The learned Laplacian weight (`--demosaic learned`,
`eval/bayer-learned-laplace-2026-11-16.md`) was fitted on noise-free mosaics. Two gaps were left open:
at SNR 25 fixed 1/8 still had the higher colour PSNR on three of ten test frames, and on the synthetic
sheet (a zone plate up to Nyquist) the learned weight lost 0.45 dB colour to the 3/16 default.

**Verdict.**

- **Noise: shipped.** A refit on the same 40 training frames plus a noisy copy of each at SNR 25 and 50
  (target: the clean frame's green) passed the test written before it was run, and is now
  `LEARNED_LAPLACE`. The gain is small: +0.014 dB colour and +0.07 dB luma at SNR 25 over the previous
  fit, for -0.023 dB colour noise-free. It still beats the 3/16 default on all ten frames, noise-free and
  noisy. The model's form, its 45 weights, its features and its C path are unchanged, so its speed is too.
- **Near-Nyquist: not shipped, and the reason is useful.** Adding 16 synthetic near-Nyquist frames
  lowered the sheet's colour PSNR from 39.42 to 38.64 dB, further below the default's 39.87. The synthetic
  tiles were mostly random colours. On those, 1/8 beats 3/16 (45 of 48 copies). On the grey zone plate,
  3/16 beats 1/8 by 5.35 dB. Fine detail does not ask for one weight: it depends on whether the colour
  channels move together.

## Pre-registration (written before any test frame was run with a new fit)

- Candidate **B** (noisy copies at SNR 25 and 50, weight 1, no synthetic, pairwise, ridge 1e-5) replaces
  `LEARNED_LAPLACE` only if, on the ten test frames: (1) at SNR 25 its colour PSNR is equal to or higher than
  the shipped learned weight's on at least 7 of 10, and (2) noise-free its mean colour PSNR is no more than
  0.05 dB below the shipped weight's, and it stays equal or better than the 3/16 default on at least 9 of
  10.
- Candidate **D** (B plus 16 near-Nyquist synthetic frames at weight 0.25) is measured for the sheet
  question only: does the sheet reach the default's 39.87 dB? It ships only if it also passes (1) and (2)
  and beats B on the sheet.

## What was added to the trainer (`tools/bayer_laplace_train.py`)

- `--noise-snr S` (repeatable): every training frame also enters as a noisy copy. Poisson-Gaussian noise
  goes on the mosaic (the same `add_noise` model the checks use, 80% shot and 20% read variance at 18%
  grey, but seeded 10,000 + frame index, not the test's seed 0). Features and the 1/8 and 1/4 greens are
  computed on the noisy mosaic. The target stays the clean truth, so the fit learns the weight a noisy
  mosaic should get. `--noise-weight` scales each copy.
- `--synthetic N`, `--synthetic-weight`: N frames from `near_nyquist_texture(seed)`. Each is a 512 x 512
  grid of 64 px tiles: straight gratings at random angles and 0.12 to 0.5 cycles per pixel (half above
  0.3), crossed "weave" gratings, or thin strokes and dots like small print, between two random colours
  (30% of tiles near grey). The CFA phase rotates through all four. It was built to be unlike the test
  sheet (`synthetic_sheet`: one centred grey zone plate, three discs, one slanted edge).
- Cross-validation now holds a real frame out **together with its noisy copies**. It scores every copy,
  and synthetic frames always stay in training. The per-frame normal equations are computed once and
  summed per fold, so a 40-fold run over 168 copies takes minutes.
- `tools/bayer_demosaic_check.py --learned-fit FIT` scores a fit that is not yet in the code as the
  variant `laplace-candidate`.

With no new options the trainer reproduces the shipped weights exactly (largest difference 0.0).

## Choosing on the training frames only (leave-one-frame-out, 40 real frames)

Green MSE at red and blue sensels in dB against the 3/16 default (positive is better), mean over the 40
held-out frames, with the count better than 3/16. The column "vs 1/8" is the gain over fixed 1/8 at
SNR 25. Rows: `eval/bayer-learned-noisy-nyquist-cv-2026-11-16.jsonl`.

| training set | clean | SNR 50 | SNR 25 | vs 1/8 at SNR 25 |
|---|---|---|---|---|
| A: clean only (the shipped fit) | +0.334 (37) | +0.379 (39) | +0.379 (39) | +0.319 (26) |
| **B: + noisy copies (chosen)** | +0.318 (33) | +0.390 (35) | **+0.446 (39)** | **+0.386 (32)** |
| C: B + 16 synthetic, weight 1 | +0.161 (23) | +0.264 (28) | +0.389 (33) | +0.329 (33) |
| D: B + 16 synthetic, weight 0.25 | +0.260 (31) | +0.346 (33) | +0.436 (38) | +0.377 (33) |
| E: A + 16 clean synthetic frames (their noisy copies loaded at weight 0) | +0.189 (27) | +0.267 (31) | +0.357 (34) | +0.297 (28) |
| F: D at ridge 1e-4 | +0.221 (28) | +0.314 (33) | +0.418 (35) | +0.358 (34) |

The synthetic frames cost real photographs accuracy at every weight tried. Noise costs a little
noise-free (-0.016 dB) and buys more under noise (+0.067 at SNR 25).

## The test set, run once per candidate (`eval/bayer-learned-noisy-nyquist-2026-11-16.jsonl`)

These are the same ten frames as before (70D, D810, A7 III, E-M10, K-1 II, A7 IV, D800E, 7D, GF7, NX1),
none of them in training, at SNR 25 (noise seed 0) and noise-free. Each cell is colour PSNR / luma PSNR
(dB).

| frame | SNR 25: 3/16 | 1/8 | old learned | **B** | noise-free: old learned | **B** |
|---|---|---|---|---|---|---|
| 70D | 42.16 / 43.62 | 42.26 / 43.96 | 42.22 / 43.78 | 42.25 / 43.90 | 48.42 / 53.36 | 48.42 / 53.35 |
| D810 | 45.11 / 45.96 | 45.20 / 46.28 | 45.16 / 46.09 | 45.18 / 46.16 | 57.78 / 60.58 | 57.61 / 60.25 |
| A7 III | 34.78 / 38.31 | 34.92 / 38.82 | 34.86 / 38.58 | 34.91 / 38.79 | 36.30 / 42.02 | 36.34 / 42.22 |
| E-M10 | 40.66 / 42.39 | 40.40 / 42.07 | 40.71 / 42.48 | 40.70 / 42.49 | 43.30 / 45.87 | 43.27 / 45.79 |
| K-1 II | 28.91 / 33.65 | 28.89 / 33.85 | 28.91 / 33.64 | 28.93 / 33.78 | 29.28 / 34.65 | 29.29 / 34.78 |
| A7 IV | 40.55 / 41.71 | 40.64 / 42.04 | 40.65 / 42.01 | 40.66 / 42.06 | 49.27 / 53.81 | 49.25 / 53.75 |
| D800E | 42.88 / 44.47 | 42.92 / 44.69 | 42.92 / 44.57 | 42.95 / 44.67 | 47.97 / 52.52 | 47.98 / 52.54 |
| 7D | 43.04 / 44.11 | 43.05 / 44.29 | 43.11 / 44.32 | 43.12 / 44.35 | 50.41 / 53.28 | 50.39 / 53.25 |
| GF7 | 30.04 / 32.10 | 29.51 / 31.29 | 30.24 / 32.36 | 30.22 / 32.35 | 30.46 / 32.67 | 30.44 / 32.65 |
| NX1 | 42.34 / 43.37 | 42.13 / 43.23 | 42.50 / 43.69 | 42.50 / 43.70 | 47.77 / 49.69 | 47.74 / 49.65 |

**B against the pre-registration:** (1) at SNR 25, colour equal or higher than the old fit on 8 of 10
(E-M10 -0.01 and GF7 -0.02 lower): passes. (2) noise-free mean colour -0.023 dB against the old fit
(range -0.17 on the D810 to +0.04 on the A7 III), and equal or better than 3/16 on 10 of 10 (+0.01 to
+0.36, mean +0.117): passes. **Shipped.**

- At SNR 25 against 3/16: colour +0.095 dB mean (better on all ten), luma +0.256 (all ten).
- Against fixed 1/8 at SNR 25, the case that prompted this: 1/8 still leads on the 70D, D810 and
  A7 III, but by 0.01, 0.02 and 0.01 dB, down from 0.04, 0.04 and 0.06. B is now ahead on the D800E,
  where the two were tied.
- The D810 is where B gives up most noise-free (-0.17 colour). It is still +0.01 over 3/16 there.
- Sheet: 39.45 dB (old fit 39.42, default 39.87). It is unchanged in substance.

**D:** at SNR 25 colour equal or higher than the old fit on 7 of 10, so (1) passes narrowly. Noise-free
mean colour is -0.075 dB, so (2) fails, and it falls below 3/16 on the D810 (57.49 against 57.60). The
sheet got worse: 38.64 dB, false colour p99 72 (old fit 59, default 42). **Not shipped.**

## Why the near-Nyquist frames pushed the wrong way

Green MSE against 3/16 for the two fixed extremes (dB, positive means the extreme is better):

| content | 1/8 vs 3/16 | 1/4 vs 3/16 | 1/8 better than 3/16 on |
|---|---|---|---|
| test sheet (grey zone plate, discs, edge) | -5.35 | -8.42 | |
| 16 synthetic frames, clean and noisy copies (48) | +0.43 | -0.80 | 45 of 48 |
| 40 real training frames, clean | -0.38 | -0.71 | 9 of 40 |

The Laplacian term borrows the red or blue sensel's own second difference as an estimate of the green
one. That holds when the channels move together, as in a grey zone plate. There the best fixed weight is
inside the range: 3/16 beats both ends by 5 to 8 dB. On a grating between two unrelated colours, the
channels' detail is not shared, so borrowing less (1/8) is right. The model saw mostly the second case
and learned "fine detail: lean to 1/8". That is wrong for the sheet and, in CV, a cost on real
photographs, whose fine detail is mostly closer to grey.

So near-Nyquist content alone is the wrong axis. What the weight should follow is how strongly the
channels' fine detail is correlated. The eight features see that only indirectly: feature 4, the
colour-difference size, measures colour, not whether the detail is shared.

## Open

- A feature for **inter-channel detail correlation** at the finest scale. One option: the red or blue
  second difference against the interpolated green second difference, over a 3 x 3 or 5 x 5 window. Then
  retrain with synthetic content whose channel correlation is drawn to match real photographs (measured
  on the 40 binned frames), and check the sheet as a held-out frame again.
- Real near-Nyquist photographs (fabric moiré, fine print) as training frames, if a CC0 or public-sample
  source has them at the binned size.
- The oracle ceiling is still +2.0 dB green against +0.32 held out. A small tree ensemble or a 2-layer
  network on the same features is still untried.

## Commands (from `ventures/photo-editing`; the sample set is not committed)

    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set arw cr2 dng nef orf pef rw2 srw)
    # 40 training files: every 2x2 Bayer file rawpy reads there, minus the ten test frames
    PYTHONPATH=src:tools python tools/bayer_laplace_train.py --train <40 files> --cache CACHE \
        --pairs --ridge 1e-5 --noise-snr 25 --noise-snr 50 --cv > B.jsonl
    PYTHONPATH=src:tools python tools/bayer_laplace_train.py --train <40 files> --cache CACHE \
        --pairs --ridge 1e-5 --noise-snr 25 --noise-snr 50 --noise-weight 0 --cv > A0.jsonl   # old fit, scored on noisy copies
    # ... --synthetic 16 [--synthetic-weight 0.25] for C to F
    PYTHONPATH=src:tools python tools/bayer_demosaic_check.py <10 test files> --learned-fit B.jsonl \
        --skip-real --no-libraw --noise-snr 25 --variant default --variant laplace-learned \
        --variant laplace-eighth --variant laplace-candidate

Python 3.13, rawpy 0.28.0 (LibRaw 0.22.2), numpy, four CPUs.

## Tests

`tests/test_bayer_demosaic.py::DirectionalTests::test_training_inputs_noise_and_near_nyquist` checks
that the synthetic frames are seeded, stay in 0.05..0.85 and carry at least 2% of their detail energy
above 0.3 cycles per pixel (a 512 x 512 crop of the binned Nikon D90 has 0.2%). It checks that a noisy
copy keeps the clean target while its greens move, and that a frame at weight 0 drops out of the fit.
The existing learned-weight and C-path tests pass with the new weights. `test_bayer_native` checks
that the C path still equals numpy with them.
