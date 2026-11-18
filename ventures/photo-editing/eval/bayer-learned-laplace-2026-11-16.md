# Bayer demosaic: a learned per-sensel Laplacian weight (2026-11-16)

Flagship item (BUILDABLE HERE): "Bayer: learned 1/8-or-1/4 selector", the open item of
`eval/bayer-adaptive-laplace-2026-11-16.md`. That note found a real ceiling (a per-sensel oracle choice
of 1/8 or 1/4 has 17-49% less green error than the better fixed weight) and no single local measure
that ranks the choice the same way on every frame (|Spearman| <= 0.16 on real frames). It suggested
"a learned one (a few local features, trained on many binned frames) ... with these ten frames as a test
set only". This note does that.

**Verdict: shipped as an opt-in choice, `--demosaic learned` (`directional(..., laplace="learned")`),
not the default.** On the ten test frames no fit saw, colour PSNR is equal or higher than the 3/16
default on all ten (+0.01 to +0.39 dB, mean +0.14). Luma is higher on all ten (+0.02 to +0.66, mean
+0.29), including the A7 III and K-1 II, where the least-squares weight lost luma. It also beats
the least-squares weight on all ten and holds up at SNR 25. It loses on the synthetic sheet (colour
-0.45 dB, luma -1.56, false colour p99 42 to 59), it is numpy-only, and it takes 4-6x the time of the C
default. So the default stays 3/16 until there is a C path, and the sheet loss is understood.

## The model

Eight scale-free local features per sensel (`bayer_demosaic._laplace_features`). Each is a ratio of
window sums, squashed as r / (1 + r) where it is unbounded, so exposure and white balance move none of
them (tested):

0. the least-squares weight of `laplace="adaptive"`, clipped to [0, 1/2];
1. curvature against slope over 3 x 3 (the sensel's own second differences against its line
   neighbours' first differences);
2. green disagreement: the row and column means of the greens against each other, over the curvature;
3. edge confidence, |D_h - D_v| / (D_h + D_v), of the colour-difference test (at 3/16);
4. colour-difference size against local level;
5. finest-scale contrast: summed second differences over local level;
6-7. features 1 and 2 over 5 x 5.

The weight is a quadratic in these features: intercept, 8 linear terms and 36 pairwise products, 45
weights (`LEARNED_LAPLACE`), clipped to [1/8, 1/4]. It is evaluated at every sensel, inside the same
row bands, so band height and thread count change no bit (tested).

**Target.** Between 1/8 and 1/4 the demosaiced green at a red or blue sensel is close to linear in the
weight: g(w) = g8 + (w - 1/8) D, D = 8 (g4 - g8). The squared error is then D^2 (w - w*)^2 with
w* = 1/8 - (g8 - truth) / D. That makes the fit a weighted least squares on w*, with weights D^2 and
each frame weighted equally, plus a ridge relative to the trace (`tools/bayer_laplace_train.py`). This
is the repository's own formulation, not taken from another program.

**Training frames:** 40 Bayer files from the same public sample set
(drewnoakes/metadata-extractor-images, not committed). These are every readable Bayer file in its
`arw cr2 dng nef orf pef rw2 srw` folders except the ten test frames, which the tool refuses as
training input: Sony A500, A5000, NEX-5N, NEX-7; Canon 350D, 600D; DJI Phantom 4 (x2), LG Nexus 5X,
Leica T, Leica X Vario, Pentax Q-S1 (DNG); Nikon D70, D90, D200, D300, D5100; 18 Olympus/OM bodies
other than the E-M10; Panasonic GF1, GF3, LX7; Samsung Galaxy NX, NX20, NX3000. Each is rendered by
LibRaw AHD and binned 4 x 4, as in `tools/bayer_demosaic_check.py`, with 200,000 red or blue sensels
sampled per frame.

## Choosing the model (leave-one-frame-out on the training frames only)

Green MSE at red and blue sensels, in dB against the 3/16 default (positive is better), averaged over
the 40 held-out frames. Rows: `eval/bayer-learned-laplace-cv-2026-11-16.jsonl`.

| model | mean gain | better than 3/16 on |
|---|---|---|
| fixed 1/8 | -0.38 | |
| fixed 1/4 | -0.71 | |
| linear, ridge 1e-3 | +0.12 | 27 of 40 |
| linear, ridge 1e-2 | +0.07 | 21 |
| pairwise, ridge 1e-2 | +0.19 | 30 |
| pairwise, ridge 1e-3 | +0.27 | 34 |
| pairwise, ridge 1e-4 | +0.32 | 35 |
| **pairwise, ridge 1e-5 (chosen)** | **+0.33** | **37** |
| per-sensel oracle in [1/8, 1/4] (ceiling) | +2.01 | 40 |

The model was then fitted on all 40 frames and frozen before any test frame was run.

## The test set, run once (`eval/bayer-learned-laplace-2026-11-16.jsonl`)

These are the ten frames the 2026-11-15 and 2026-11-16 notes scored (tuning 70D and D810; held-out
A7 III, E-M10 and K-1 II; fresh A7 IV, D800E, 7D, GF7 and NX1), plus the synthetic sheet. None were in
training. Each cell is colour PSNR / luma PSNR (dB) / false colour p99 (thousandths), noise-free.

| truth | 3/16 (default) | adaptive (LS) | **learned** | 1/8 | 1/4 |
|---|---|---|---|---|---|
| 70D | 48.28 / 52.99 / 18.6 | 48.34 / 53.11 / 18.5 | **48.42 / 53.36** / 18.5 | 48.35 / 53.12 / 18.7 | 47.90 / 52.10 / 19.3 |
| D810 | 57.60 / 60.36 / 8.1 | 57.78 / 60.58 / 7.9 | **57.78 / 60.58** / 8.0 | 57.28 / 59.61 / 8.4 | 57.50 / 60.40 / 8.2 |
| A7 III | 36.19 / 41.55 / 63.4 | 36.11 / 41.22 / 63.5 | 36.30 / 42.02 / 63.5 | **36.34 / 42.22** / 63.6 | 35.94 / 40.64 / 63.6 |
| E-M10 | 43.24 / 45.80 / 41.7 | 43.26 / 45.82 / 41.6 | **43.30 / 45.87 / 41.4** | 42.72 / 44.81 / 44.1 | 42.67 / 45.15 / 45.7 |
| K-1 II | 29.27 / 34.63 / 139.3 | 29.23 / 34.39 / 139.1 | **29.28** / 34.65 / 139.1 | 29.24 / **34.78** / 140.9 | 29.16 / 34.03 / 138.8 |
| A7 IV | 49.17 / 53.53 / 17.0 | 49.14 / 53.42 / 17.0 | **49.27 / 53.81 / 16.9** | 49.09 / 53.24 / 17.2 | 48.99 / 53.12 / 17.4 |
| D800E | 47.87 / 52.22 / 23.4 | 47.90 / 52.28 / 23.2 | **47.97 / 52.52** / 23.3 | 47.77 / 51.89 / 23.6 | 47.52 / 51.41 / 24.8 |
| 7D | 50.31 / 53.10 / 16.1 | 50.37 / 53.18 / 15.9 | **50.41 / 53.28** / 16.1 | 49.92 / 52.31 / 16.5 | 50.01 / 52.67 / 17.4 |
| GF7 | 30.25 / 32.38 / 150.6 | 30.34 / 32.49 / 149.1 | **30.46 / 32.67 / 146.3** | 29.69 / 31.50 / 163.1 | 30.35 / 32.53 / 146.5 |
| NX1 | 47.38 / 49.03 / 29.5 | 47.75 / 49.51 / 27.7 | **47.77 / 49.69 / 27.7** | 46.55 / 47.78 / 32.2 | 46.74 / 48.45 / 31.0 |
| sheet (synthetic) | 39.87 / 44.20 / 42.1 | **40.47 / 45.97 / 9.6** | 39.42 / 42.64 / 58.9 | 38.31 / 39.77 / 113.7 | 35.59 / 36.63 / 119.5 |

- **Learned against the 3/16 default, real frames:** colour PSNR +0.14 dB on average (+0.01 to +0.39;
  equal or better on ten of ten), luma +0.29 (+0.02 to +0.66; better on ten of ten). False colour is
  lower or equal on nine, and 0.1 higher on the A7 III.
- **Against the least-squares weight:** colour equal or better on all ten real frames. It gains luma
  where the least-squares weight lost it: A7 III +0.80, K-1 II +0.26 against that weight.
- **Against every fixed weight:** best colour PSNR of the five on nine of ten (1/8 wins the A7 III by
  0.04 dB).
- **At SNR 25** (colour PSNR, default then learned): 70D 42.16 / 42.22, D810 45.11 / 45.16, A7 III
  34.78 / 34.86, E-M10 40.66 / 40.71, K-1 II 28.91 / 28.91, A7 IV 40.55 / 40.65, D800E 42.88 / 42.92,
  7D 43.04 / 43.11, GF7 30.04 / 30.24, NX1 42.34 / 42.50. That is equal or better on all ten, while the
  false colour p99 rises 0.2-1.2 on six. Fixed 1/8 has the higher colour PSNR on the 70D, D810 and A7 III
  under noise (and ties on the D800E), so the model, trained noise-free, does not fully cover noisy input.
- **The sheet loses.** A zone plate up to Nyquist is far from any photograph in training: the model
  leans to 1/8 there, where 3/16 and the least-squares weight do better. This is the reason for "not
  the default" alongside speed. Real photographs with that much near-Nyquist content (fabric moiré,
  fine print) would be the case to look at.

**Real sensor data** (closeness to LibRaw AHD on the full frames, not a quality score): learned is
closer than 3/16 on six of ten, further on the A7 III, E-M10, K-1 II and GF7.

**Speed** (numpy, four cores, this machine): 2.9-6.9 s per full frame, against 0.5-1.8 s for the
default's C path (3.9-6.0x) and 1.6-4.1 s for the least-squares weight. The C path refuses `learned`.

## Commands (from `ventures/photo-editing`)

    # training, cross-validation and the fit (the ten test frames are refused)
    PYTHONPATH=src:tools python tools/bayer_laplace_train.py --train <40 training files> \
        --cache /tmp/cache --cv --pairs --ridge 1e-5 > cv.jsonl
    # the test set, once
    PYTHONPATH=src:tools python tools/bayer_demosaic_check.py "cr2/Canon EOS 70D.cr2" \
        --variant default --variant laplace-adaptive --variant laplace-learned --variant laplace-eighth \
        --variant laplace-quarter --no-libraw --noise-snr 25
    PYTHONPATH=src:tools python tools/bayer_demosaic_check.py <the other nine> <same variants> --skip-sheet

rawpy 0.28 with LibRaw 0.22.2, numpy. LibRaw's own methods were not rerun. Their rows for these frames
are in the 2026-11-15 and 2026-11-16 notes: the default already beat all seven on colour PSNR on the
five fresh frames.

## Tests

`tests/test_bayer_demosaic.py::test_learned_laplace` checks that there are 45 weights, that the
features are finite, in [0, 1] and unmoved by a 7.5x gain, that the weight stays in [1/8, 1/4], that
each sensel keeps its own value, that flat fields stay flat, that a constant model equals that fixed
weight, that the C path refuses it, and that a wrong-length weight list is refused.
`test_bands_equal_one_piece` now covers `laplace="learned"`. `DeveloperChoiceTests.test_learned_is_an_opt_in_choice`
checks that `--demosaic learned` reports "learned", that `auto` still reports "directional", and that
the pure-Python engine refuses it.

## Open

- **A C path** for the feature map and the 45-term weight, so the learned weight costs about what the
  default does. Then it can be weighed as the default.
- **The sheet:** add synthetic or real near-Nyquist content (zone plates, fabric, print) to training,
  or a feature that sees it. Then check the sheet as a held-out frame again.
- **Noise:** train with noisy mosaics against clean truths. The noise-free fit leaves fixed 1/8 ahead
  on three of ten at SNR 25.
- The oracle ceiling is +2.0 dB green; the model gets +0.33 held out. A small tree ensemble or a 2-layer
  network on the same features is the next try, still with the same ten frames as the only test.
