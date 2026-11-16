# Learned Bayer weight: a gradient-boosted model against the linear B and the 4 x 4 ceiling (2026-11-16)

Flagship item (BUILDABLE HERE): "Bayer learned: 4x4 tile oracle +0.83 dB vs B +0.385 held out
(eval/bayer-oracle-ceiling-*); next a boosted-tree weight on the cached samples, pre-registered against
both."

## Pre-registration (written and committed before any number below was computed)

**Question.** The 4 x 4 tile oracle reaches +0.833 dB of green MSE over the 3/16 default on the 40 training
frames; the shipped linear weight B (`LEARNED_LAPLACE`, eight features and their pairwise products) reaches
+0.3847 dB leave-one-frame-out. Does a non-linear model over the same features plus their neighbourhood
recover a useful part of the 0.45 dB between them?

**Frames and target.** Exactly the oracle note's: the 40 frames of `eval/bayer-learned-train-frames.txt`, each
clean and with noise at SNR 50 and 25 (seed 10,000 + frame index), 120 copies; truth is LibRaw AHD binned
4 x 4; at a red or blue sensel the target is `w* = 1/8 - (g8 - truth) / D`, `D = 8 (g4 - g8)`, weighted by
D^2 with each copy's weights summing to one (the trainer's weighting). The prediction is clipped to
[1/8, 1/4] before scoring, as B's is.

**Features (29, fixed now).** At the sensel: the eight `laplace_features`, the four
`CORRELATION_FEATURES` (they failed as linear terms; a tree may use them differently), and
`log10(|D| + 1e-6)`; then, for each of the eight base features, its mean and its standard deviation over the
centred 5 x 5 window (all sensels of the window, any colour). No feature reads the truth.

**Model (fixed now, no tuning on any score).** LightGBM regression, L2 loss, the D^2 weights above as sample
weights; 63 leaves, learning rate 0.05, 400 rounds, at least 400 samples per leaf, `min_sum_hessian_in_leaf`
0, feature and bagging fraction 0.8 (bagging every round), seed 0. Training sensels: 30,000 per copy drawn
(seed 20,000 + frame index) from that copy's 200,000 trainer sensels (the trainer's own seed, border and
order, as in the oracle note).

**Cross-validation.** Five folds by source frame (frame index mod 5; a frame is held out with its noisy
copies). Each held-out copy is scored on all its 200,000 trainer sensels. B's model (intercept, eight
features, pairwise products, ridge 1e-5) is refitted on the same five folds' training frames, so the two are
compared on identical splits; the 40-fold +0.3847 is reported beside them for reference.

**What decides (written down now).** Let G and L be the boosted and linear five-fold CV gains (mean over the
120 copies, dB over 3/16).

1. **Pass to the test frames** only if G >= L + 0.02 dB (the bar the correlation and oracle notes used) and
   the boosted model is better than the linear one on at least 72 of 120 copies (60%).
2. **Test.** A model that passes is refitted on all 120 copies and scored once on the ten test frames
   (70D, D810, A7 III, E-M10, K-1 II, A7 IV, D800E, 7D, GF7, NX1), each clean and at SNR 50 and 25 with the
   same seeds rule, full frames inside the 12-sensel border, against B as shipped. It counts as a win if its
   mean gain is at least 0.02 dB above B's and it beats B on at least 18 of the 30 copies.
3. **Shipping is not decided here.** A win makes "ship a tree weight in the demosaic" (numpy and C
   inference, colour PSNR on the test frames, speed) the next item; a loss means the flagship row drops the
   richer-model item and records that a boosted model over these features was tried.
4. Either way the note reports G as a share of the 0.45 dB headroom (O4 - B).

## Verdict

**Both pre-registered bars passed.** In five-fold CV the boosted model gains **+0.527 dB** over 3/16
against **+0.386** for B's linear model on the same folds (the 40-fold figure was +0.3847), and it is better
on **108 of 120** copies (bar: +0.02 dB and 72). On the ten test frames, scored once, it gains **+0.451 dB**
against the shipped B's **+0.406** and beats B on **22 of 30** copies (bar: +0.02 dB and 18).

It recovers about **31% of the headroom** in CV ((0.527 - 0.385) / (0.833 - 0.385)). On the test frames the
margin over B is a third of the CV margin (+0.044 against +0.141 dB), so read the CV figure as optimistic.

**Not shipped, and one frame is why the next step needs a guard.** On the Pentax K-1 Mark II the boosted
weight is *below the 3/16 default* at every noise level (-0.21, -0.23, -0.29 dB), where B gains +0.25. The
A7 III also loses to B (-0.07 to -0.20 dB). Seven of the ten frames gain on all three copies, by up to
+0.31 dB (D810 at SNR 25). B is below 3/16 on three test copies (D810 clean -0.13, E-M10 clean -0.10 and
SNR 50 -0.02; the boosted model lifts the E-M10 to +0.11 and +0.15); the boosted model is below it on four
(D810 clean -0.14 and all three K-1 II copies). A weight that makes one held-out camera worse than doing nothing is not one to
put in a raw developer as it stands. The pre-registration left shipping to a separate test; that test now
needs a no-worse-than-B-by-more-than-X rule per frame, not only a mean.

In CV the boosted model is below 3/16 on two copies (Olympus XZ1 clean and SNR 50) against twelve for the
linear refit; its worst losses to the linear model are the LX7 (-0.17 dB on all three copies) and the D200.

## Results

Green-MSE gain over 3/16, dB, mean over copies. Rows: `eval/bayer-boosted-weight-2026-11-16.jsonl` (one
`cv_copy` row per training copy, one `test_copy` row per test copy, and the final model's feature
importance).

| five-fold CV (40 training frames) | boosted | linear (same folds) | B as shipped (in sample) | boosted > linear |
|---|---|---|---|---|
| clean (40) | +0.472 | +0.321 | +0.343 | 36 |
| SNR 50 (40) | +0.531 | +0.391 | +0.413 | 36 |
| SNR 25 (40) | +0.578 | +0.446 | +0.467 | 36 |
| **all (120)** | **+0.527** | **+0.386** | +0.408 | **108** |

| test frames (full frames inside the border) | boosted | B | boosted > B |
|---|---|---|---|
| clean (10) | +0.306 | +0.266 | 7 |
| SNR 50 (10) | +0.476 | +0.435 | 8 |
| SNR 25 (10) | +0.570 | +0.517 | 7 |
| **all (30)** | **+0.451** | **+0.406** | **22** |

Per test frame (boosted minus B, dB, clean / SNR 50 / SNR 25): 70D +0.08 / +0.07 / +0.07; D810 -0.01 /
+0.12 / +0.31; A7 III -0.07 / -0.09 / -0.20; E-M10 +0.21 / +0.18 / +0.14; K-1 II -0.46 / -0.48 / -0.53;
A7 IV +0.04 / +0.02 / -0.01; D800E +0.16 / +0.16 / +0.24; 7D +0.14 / +0.14 / +0.16; GF7 +0.18 / +0.18 /
+0.18; NX1 +0.13 / +0.13 / +0.15.

**What the trees use.** Share of total split gain in the final model: the 5 x 5 mean of feature 5 (finest
scale contrast over local level) 14%, feature 0 (the 3 x 3 least-squares weight) 11%, feature 5 itself 11%,
log|D| 5%, then a long tail; the four correlation features together 7%. The sixteen 5 x 5 neighbourhood
statistics carry 51% of the gain (means 33%, standard deviations 18%) between them, which is the "choice at 2 to 8 sensels" the oracle note said B misses.

## What this says about the next step

1. **A guarded tree weight is worth one more run.** The candidate: the same model, with a fallback to B
   wherever the frame-level mean of feature 5 is outside the training frames' range (the K-1 II has no
   optical low-pass filter; whether that is the cause is a hypothesis, not a finding). Pre-register it on CV only, then score it once on the test frames with a per-frame floor.
2. **Shipping needs inference without lightgbm.** 400 trees of 63 leaves are about 25,000 nodes: a numpy
   walk over flattened arrays (and the existing C path) can evaluate them per sensel. Speed is part of that
   test; the linear B costs 45 multiply-adds per sensel.

## Commands (from `ventures/photo-editing`; the sample set is not committed)

    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set arw cr2 dng nef orf pef rw2 srw)
    pip install rawpy numpy lightgbm
    PYTHONPATH=src:tools python tools/bayer_boosted_weight.py --train <the 40 files of eval/bayer-learned-train-frames.txt, in order> \
        --test <the 10 test files, in tools/bayer_laplace_train.TEST_FRAMES order> --cache DIR \
        --noise-snr 50 --noise-snr 25 --cv > eval/bayer-boosted-weight-2026-11-16.jsonl

Python 3.11, rawpy, numpy 2, lightgbm 4, four CPUs: about 25 minutes for the 120 training copies, the five
folds, the final fit and the 30 test copies.

## Tests

`tests/test_bayer_demosaic.py::DirectionalTests::test_boosted_weight_tool`: the 5 x 5 mean matches a
brute-force one with reflected edges; the tool's sample is the trainer's (same sensels, greens and twelve
features); its gain matches a direct score of B; the linear refit beats 3/16 in sample.
