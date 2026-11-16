# Learned Bayer weight: an inter-channel detail correlation feature (2026-11-16)

Flagship item (BUILDABLE HERE): "Bayer learned: next a feature for inter-channel detail correlation, then
correlation-matched synthetic frames (eval/bayer-learned-noisy-nyquist-*)".

## Pre-registration (written and committed before any test frame was run with a new fit)

The shipped weight is **B** (`LEARNED_LAPLACE`, eight features, 45 weights; trained on 40 real frames plus
noisy copies at SNR 25 and 50, pairwise, ridge 1e-5; `eval/bayer-learned-noisy-nyquist-2026-11-16.md`).

New features (`bayer_demosaic._correlation_features`), each in [0, 1]: `corr3` and `corr5`, (rho + 1) / 2 of
the normalised correlation between the sensel's own second difference and the other colour's second
difference centred on it, over a 3 x 3 or 5 x 5 window (rows and columns pooled); `corr3sq` and `corr5sq`,
rho squared.

**Choosing on the training frames only.** Leave-one-frame-out CV on the same 40 frames and noisy copies
(B's training set, B's options), with these feature sets added to the eight: G1 `corr3`; G2 `corr3sq`; G3
`corr3` + `corr3sq`; G4 `corr3sq` + `corr5sq`. Score: mean over the 120 held-out copies of the green-MSE
gain over 3/16 in dB. The best G goes to the test set only if its score beats B's own CV score (computed in
the same run, same samples) by at least 0.02 dB. Then **M**: the best G plus 16 synthetic frames whose
channel correlation is matched to the real frames (`--synthetic-kind matched`, weight 0.25) goes to the test
set only if its CV score is within 0.01 dB of the best G's; it is the candidate for the sheet question.

**Test set (run once per candidate that qualifies).** The same ten frames (70D, D810, A7 III, E-M10, K-1 II,
A7 IV, D800E, 7D, GF7, NX1) and the synthetic sheet, at SNR 25 (noise seed 0) and noise-free, with
`tools/bayer_demosaic_check.py --learned-fit`. A candidate replaces `LEARNED_LAPLACE` only if all three hold:

1. at SNR 25 its colour PSNR is equal to or higher than B's on at least 7 of 10 frames;
2. noise-free, its mean colour PSNR is no more than 0.02 dB below B's, and it is equal to or better than
   the 3/16 default on at least 9 of 10;
3. on the synthetic sheet (noise-free) its colour PSNR is higher than B's 39.45 dB.

If none qualifies or none passes, `LEARNED_LAPLACE` stays B and the result is written up here either way.

## Verdict

**Not shipped: no candidate reached the test set.** `LEARNED_LAPLACE` stays B. The features, the trainer
options and the tests land as tools for the next try, and the shipped demosaic's output is unchanged.

- The best feature set, G4 (`corr3sq` + `corr5sq`), gains **+0.012 dB** in cross-validation over B. The
  bar written in advance was 0.02 dB, so no G went to the test set. It is better than B on 89 of 120
  held-out copies, so the signal is real, but it is small.
- The correlation-matched synthetic frames (M) lowered the CV score to 0.013 dB below G4. The window was
  0.01 dB, so M did not go to the test set either.
- The open item's hypothesis was that unrelated channels call for a lower weight. On real photographs it
  is the other way round (table below). This is why the feature buys so little: the model's eight
  features already carry most of what the correlation says.
- Exploratory, after the verdict and not a test (only the synthetic sheet was scored; no test photograph
  was run): G4 and M both make the sheet **worse**, 39.24 and 39.28 dB against B's 39.45 and the
  default's 39.87. The correlation feature does not close the sheet gap. Because of this run, the sheet is
  no longer an unseen frame for these features.

## Choosing on the training frames only (leave-one-frame-out, 40 real frames and noisy copies)

Green MSE at red and blue sensels, in dB against the 3/16 default (positive is better), mean over the
held-out copies, with the count better than 3/16 in brackets. "All" is the mean over all 120 copies,
which is the score set out in the pre-registration. Rows:
`eval/bayer-channel-correlation-cv-2026-11-16.jsonl`.

| feature set | clean | SNR 50 | SNR 25 | all | copies better than B |
|---|---|---|---|---|---|
| B: the eight (shipped; reproduced to the last digit) | +0.318 (33) | +0.390 (35) | +0.446 (39) | +0.3847 | |
| G1: + `corr3` | +0.324 (33) | +0.393 (35) | +0.447 (39) | +0.3877 | 86 / 120 |
| G2: + `corr3sq` | +0.325 (32) | +0.393 (35) | +0.449 (39) | +0.3891 | 74 / 120 |
| G3: + `corr3` + `corr3sq` | +0.324 (32) | +0.393 (35) | +0.450 (39) | +0.3890 | 77 / 120 |
| **G4: + `corr3sq` + `corr5sq`** | +0.333 (32) | +0.400 (35) | +0.457 (39) | **+0.3966** | 89 / 120 |
| M: G4 + 16 matched synthetic, weight 0.25 | +0.312 (32) | +0.384 (35) | +0.454 (39) | +0.3832 | 51 / 120 |

G4 against B: +0.0119 dB, under the 0.02 bar. M against G4: -0.0134 dB, outside the 0.01 window.

**Matching the synthetic frames.** The mean `corr3sq` at red and blue sensels is 0.253 over the 40 real
frames (10th to 90th percentile per frame 0.13 to 0.36). The 2026-11-16 near-Nyquist tiles (30% near
grey) give 0.145. With 80% of tiles near grey (spread 0.15) they give 0.254, so `--synthetic-kind matched`
uses that (`MATCHED_GREY_SHARE`). The sign of rho cannot be matched by colour alone. Real binned frames
have a mean `corr3` of 0.327 (rho mostly negative, detail below a quarter cycle per pixel). The tiles have
0.437, because their detail sits higher in frequency.

## What the correlation says on real frames (training frames only)

The 40 real training frames (clean), with red and blue sensels binned by rho. "1/8 vs 3/16" and
"1/4 vs 3/16" are green-MSE gains in dB (positive means that fixed weight beats 3/16). The last column is
the share of sensels where 1/8 is nearer the truth than 1/4.

| rho | share | 1/8 vs 3/16 | 1/4 vs 3/16 | 1/8 nearer than 1/4 |
|---|---|---|---|---|
| -1.0 .. -0.8 | 0.115 | -0.46 | -1.10 | 0.60 |
| -0.8 .. -0.6 | 0.186 | -0.68 | -0.57 | 0.55 |
| -0.6 .. -0.4 | 0.175 | -0.72 | -0.15 | 0.54 |
| -0.4 .. -0.2 | 0.168 | -0.67 | -0.08 | 0.56 |
| -0.2 .. +0.2 | 0.280 | -0.50 | -0.16 | 0.59 |
| +0.2 .. +0.4 | 0.057 | -0.44 | -0.10 | 0.59 |
| +0.4 .. +1.0 | 0.020 | -0.20 to -0.47 | -0.04 to -0.11 | 0.49 to 0.56 |

- Where detail is strongly shared (rho near -1: edges and smooth shading below a quarter cycle), the
  quarter overshoots most (-1.10 dB) and 3/16 is the best of the three.
- Where the correlation is weak, the quarter comes within 0.1-0.2 dB of 3/16 and the eighth stays 0.5-0.7
  dB behind. Unrelated channels call for **more** borrowing, not less. That is the opposite of what the
  open item supposed from the synthetic tiles. On the matched tiles, the same bins swing either way from
  one bin to the next (1/4 vs 3/16 from -2.32 to +1.43 dB). Both tables, with the finer bins:
  `eval/bayer-channel-correlation-bins-2026-11-16.txt`.
- Positive rho, the aliasing zone above a quarter cycle where the sheet's zone plate spends its outer
  rings, covers 8% of real sensels and 2% above +0.4. The model learns little there. That fits the sheet
  getting worse when the feature is added.
- In every bin, 1/8 is nearer than 1/4 on 49-60% of sensels. Which way a single sensel should go is close
  to a coin flip whatever its local correlation. That is a warning about the oracle ceiling (+2.0 dB
  green against +0.33 held out): much of it may be per-sensel chance that no local feature can predict.

## Open

- **The sheet and real photographs pull apart.** The sheet's outer rings are in the aliasing zone that
  real binned frames barely visit. To serve both, the model would need real near-Nyquist photographs
  (fabric moiré, fine print) at the binned size from a public-sample source, not more synthetic tiles. Two
  tries at synthetic tiles have now failed.
- **The ceiling.** Before trying a tree ensemble or a small network, measure how much of the oracle's gain
  any smooth function of the features could reach. One way: fit with a 4 x 4 box-averaged target w*
  instead of the per-sensel one, and see how far the oracle falls.
- A native (C) path for 10-feature models, if a later candidate passes. `directional` now runs such a
  model in numpy and refuses `native=True`.

## Commands (from `ventures/photo-editing`; the sample set is not committed)

    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set arw cr2 dng nef orf pef rw2 srw)
    # the same 40 training files as eval/bayer-learned-noisy-nyquist-2026-11-16.md; a new cache (12 feature columns)
    PYTHONPATH=src:tools python tools/bayer_laplace_train.py --train <40 files> --cache NEWCACHE \
        --pairs --ridge 1e-5 --noise-snr 25 --noise-snr 50 --cv [--extra corr3sq --extra corr5sq] > G.jsonl
    # M: add --synthetic 16 --synthetic-kind matched --synthetic-weight 0.25
    # a fit with extras scores through --learned-fit (the fit's "extra" list is passed on)
    PYTHONPATH=src:tools python tools/bayer_demosaic_check.py FILE --learned-fit G.jsonl --variant laplace-candidate

Python 3.13, rawpy (LibRaw 0.22), numpy, four CPUs. The cache build took about 10 minutes. Each CV run
over the cache took a minute or two.

## Tests

`tests/test_bayer_demosaic.py::DirectionalTests::test_correlation_features`: the four features are
finite, in [0, 1] and unmoved by a 7.5x gain. `corr3sq` is above 0.5 on a grey zone plate and below 0.25
where each channel is its own random field. A weight count picks the feature count (45 is 8 with pairs,
66 is 10). A 10-feature model keeps each sensel's value, keeps flat fields flat, runs in numpy, refuses
`native=True`, and refuses a mismatched extra list. `test_training_inputs_noise_and_near_nyquist` now
checks that the cache's 12 columns select back to the eight and to a named order.
