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
