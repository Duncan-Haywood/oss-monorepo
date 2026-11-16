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
