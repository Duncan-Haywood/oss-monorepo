# Learned Bayer weight: how much of the oracle can any smooth weight reach? (2026-11-16)

Flagship item (BUILDABLE HERE): "Bayer learned: correlation feature failed its CV bar
(eval/bayer-channel-correlation-*); next the oracle ceiling, 4x4-averaged target."

The per-sensel oracle (pick the best weight in [1/8, 1/4] at every red and blue sensel, knowing the truth)
gains about +2 dB of green MSE over the 3/16 default on the training frames. The shipped learned weight B
gains +0.38 dB held out. Two tries at new features and synthetic frames bought 0.01 dB or less
(eval/bayer-channel-correlation-2026-11-16.md), and in every correlation bin the better of 1/8 and 1/4 was
close to a coin flip. Before anyone spends runs on a tree ensemble or a small network, this note asks how
much of that +2 dB is reachable at all by a weight that is smooth in space, and how much is per-sensel chance.

## Pre-registration (written and committed before any number below was computed)

**Frames.** Only the 40 training frames of `eval/bayer-learned-train-frames.txt`, each clean and with
noise at SNR 50 and 25 (the trainer's seeds: frame i, noise seed 10,000 + i): 120 copies. The ten test frames
and the synthetic sheet are not opened. Truth, mosaic and the green model are the trainer's
(`tools/bayer_laplace_train.py`): truth is LibRaw AHD binned 4 x 4, and at a red or blue sensel
`g(w) = g8 + (w - 1/8) D`. Every red and blue sensel inside a 12-sensel border is scored, not a sample.

**Ceilings.** For a tile size b in {1, 2, 4, 8, 16, 32} sensels, the **tile oracle** picks one weight per
non-overlapping b x b tile, the D^2-weighted least-squares weight of the tile's red and blue sensels, clipped
to [1/8, 1/4]. Because the error is quadratic in w, that is the exact best constant weight for the tile:
an upper bound on every model whose weight is constant on b x b tiles. b = 1 is the per-sensel oracle the
trainer reports. Score per copy: green-MSE gain over 3/16 in dB; the summary is the mean over the 120
copies, as in the earlier notes. B (`LEARNED_LAPLACE`) is scored on the same full frames. It was trained on
these frames, so its full-frame score is in-sample; the held-out figure is the earlier note's +0.385 dB.

**What decides the next step (written down now).** Let O4 be the 4 x 4 tile oracle's mean gain and H = 0.385 dB.

1. If O4 < 2 H (0.77 dB), most of the per-sensel ceiling is chance at a scale no local model sees. Then the
   flagship row drops "tree ensemble or small network" and says the weight is near its useful limit.
2. If O4 >= 2 H, there is spatially coherent gain the linear model misses, and a richer model stays the
   next item, with O4 as its stated ceiling.

**Smoothed target (one candidate, CV only).** The item's other half: fit B's model (eight features,
pairwise, ridge 1e-5, the same noisy copies) to the 4 x 4 box-averaged target instead of the per-sensel w*,
and score it leave-one-frame-out on the same 200,000 sampled sensels per copy that B's CV used, against
the per-sensel truth. It goes on to the test frames only if its CV score beats B's (same run) by at least
0.02 dB, the bar the correlation note used. The target is a centred 4 x 4 box of D^2 w* over D^2 (red and
blue sensels only), so it differs from w* only where w* changes inside the box.

## Verdict

(Filled in after the run.)
