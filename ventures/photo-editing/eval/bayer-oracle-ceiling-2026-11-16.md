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

**Rule 2 applies: O4 = +0.833 dB, at or above 2 H = 0.77.** A richer model stays the next item, and its
stated ceiling is about +0.83 dB, not +1.9. That leaves about 0.45 dB of headroom over B's held-out +0.385
for any model whose weight is constant on 4 x 4 tiles. The margin over the bar is small (0.06 dB). Read
it as "worth one well-chosen try", not "a lot left".

**The smoothed target fails: -0.062 dB in CV** (+0.3224 against B's +0.3847, better on 12 of 120 copies).
It does not go to the test frames. `LEARNED_LAPLACE` stays B, and the shipped demosaic is unchanged.
B's CV score came out at +0.3847, the same as the correlation note's to the last digit, so the sampling and
the fit are the trainer's.

- **Most of the per-sensel oracle is per-sensel.** Going from one weight per sensel to one per 2 x 2 tile
  loses a quarter of it (+1.91 to +1.43 dB). At 4 x 4, 56% is gone (+0.83). The coin flip the correlation
  note found in every bin shows up here as a ceiling that halves within four sensels.
- **B is about as good as one perfect weight per 32 x 32 tile.** On the full frames (in sample) B scores
  +0.405 dB and the 32 x 32 tile oracle +0.412. Its features already capture the coarse, regional choice
  ("this part of the frame wants less of its own detail"). What it misses is the choice at 2 to 8 sensels.
- **Why the box target loses.** Least squares on w* already averages over sensels with the same features,
  so smoothing the target adds no information. It only moves each sensel's target toward its neighbours',
  which is the wrong answer wherever the features differ from the neighbours'.
- Noise makes the tiles worth more (+0.81 clean, +0.83 at SNR 50, +0.86 at SNR 25) while the per-sensel
  ceiling falls (+2.00 to +1.80). At SNR 25, B reaches 54% of O4.

## The ceiling at each tile size (40 training frames, full frames)

Green-MSE gain over 3/16 in dB, mean over copies. B is in sample here (it was trained on these frames).
The last column is the 4 x 4 box-averaged target used directly as the weight (an oracle too). Rows, one
per copy, then one CV row per copy: `eval/bayer-oracle-ceiling-2026-11-16.jsonl`.

| copies | 1/8 | 1/4 | B | 1 x 1 | 2 x 2 | 4 x 4 | 8 x 8 | 16 x 16 | 32 x 32 | 4 x 4 box |
|---|---|---|---|---|---|---|---|---|---|---|
| clean (40) | -0.380 | -0.709 | +0.339 | +2.002 | +1.477 | +0.812 | +0.535 | +0.408 | +0.343 | +0.771 |
| SNR 50 (40) | -0.197 | -0.733 | +0.410 | +1.913 | +1.437 | +0.829 | +0.578 | +0.463 | +0.403 | +0.798 |
| SNR 25 (40) | +0.061 | -0.778 | +0.466 | +1.803 | +1.389 | +0.858 | +0.642 | +0.542 | +0.490 | +0.838 |
| **all (120)** | -0.172 | -0.740 | +0.405 | +1.906 | +1.434 | **+0.833** | +0.585 | +0.471 | +0.412 | +0.802 |

- Per copy, O4 runs from +0.43 (Sony A500) to +1.55 dB (Olympus E-P3), and is 2.1 times B's in-sample
  gain at the median. B is at or above the 8 x 8 oracle on 5 of 120 copies and above the 16 x 16 on 47.
- The frames where B gains least are the ones where even a perfect regional weight gains least: the two
  DJI Phantom 4 DNGs and the A500 (B -0.02 to +0.05 dB; the 32 x 32 oracle is below 3/16 on all three).
  On those, the right weight changes from sensel to sensel, and no regional choice helps.

## Leave-one-frame-out, B's model on two targets (same 200,000 sensels per copy)

| copies | per-sensel w* (B) | 4 x 4 box target |
|---|---|---|
| clean | +0.318 | +0.237 |
| SNR 50 | +0.390 | +0.324 |
| SNR 25 | +0.446 | +0.406 |
| all (120) | **+0.3847** | +0.3224 |

## What this says about the next try

The bound is for weights that are constant on tiles. A model that reads per-sensel features can in principle
go beyond it, up to the +1.9 per-sensel ceiling. But the correlation note's bins say that part is close to
chance for every local measure tried so far, so O4 is the realistic target. A tree ensemble or a small
network over the same eight features plus a 5 x 5 neighbourhood of them is the next try. Pre-register it
against B's +0.385 CV and this +0.83 ceiling. The cheapest version is a gradient-boosted model on the
trainer's cached samples: it needs no new frames.

## Commands (from `ventures/photo-editing`; the sample set is not committed)

    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set arw cr2 dng nef orf pef rw2 srw)
    # the 40 files of eval/bayer-learned-train-frames.txt, in that order (the order sets each frame's seed)
    PYTHONPATH=src:tools python tools/bayer_oracle_ceiling.py --train <40 files> --cache DIR \
        --noise-snr 50 --noise-snr 25 --cv > eval/bayer-oracle-ceiling-2026-11-16.jsonl

Python 3.13, rawpy 0.28 (LibRaw), numpy 2.5, four CPUs: 4 minutes 53 seconds for the 120 copies and the CV.

## Tests

`tests/test_bayer_demosaic.py::DirectionalTests::test_oracle_ceiling_tiles`: the box sum matches a
brute-force sum; each tile's weight is the best constant on a 1,251-point grid; nested tiles never gain more
as they grow; the 1 x 1 tile beats 1/8, 1/4 and B; and the tool's sample is the trainer's (same sensels,
greens and eight features).
