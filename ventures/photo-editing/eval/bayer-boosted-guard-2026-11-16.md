# Guarding the boosted Bayer weight: four fallbacks to B, chosen on CV, confirmed on fresh frames (2026-11-16)

Flagship item (BUILDABLE HERE): "Bayer boosted trees beat B on test (+0.451 vs +0.406 dB) but K-1 II falls
below 3/16 (eval/bayer-boosted-weight-*); next a guarded variant, then numpy tree inference."

## Pre-registration (written and committed before any number below was computed)

**Why a guard.** `eval/bayer-boosted-weight-2026-11-16.md` passed both of its bars, but on the Pentax K-1
Mark II the boosted weight is below the 3/16 default on all three copies (-0.21 to -0.29 dB) where the
linear B gains +0.25. A weight that can make one camera worse than doing nothing does not go into a raw
developer. The question here: is there a fallback to B, decided from the mosaic alone, that keeps most of
the boosted model's gain and removes the per-frame losses?

**A known contamination, stated up front.** The K-1 II result is already known, and guard C1a below is the
one that note proposed after seeing it. So the ten test frames can no longer give a clean verdict on a
guard. They are scored again (it would be odd not to), but the clean check is a **fresh set**: every Bayer
file of the public sample set (drewnoakes/metadata-extractor-images) that no earlier note has used as a
truth frame, from the folders `cr3`, `crw`, `dcr`, `rwl`, `raf`, plus `nef/Issue 247-*.nef` and
`rw2/Issue 419.rw2`. Rule fixed now, before opening any of them: a file is in if rawpy reads it as a 2 x 2
Bayer mosaic (`raw_pattern` 2 x 2 with one red, two greens, one blue) of at least 6 million sensels and
`binned_truth` succeeds; one file per camera model (by EXIF model, the first in sorted path order); X-Trans
and non-Bayer files are out. No fresh file trains or chooses anything.

**Model.** Exactly the boosted note's: same 29 features, LightGBM parameters, 400 rounds, 30,000 training
sensels per copy, D^2 weights, the 40 training frames x {clean, SNR 50, SNR 25}, five folds by frame
(index mod 5). The linear refit on the same folds stands in for B inside CV, as before.

**Candidates (fixed now; no other is tried).** T is the tree weight, B the linear weight (in CV, the
fold's linear refit; outside CV, `LEARNED_LAPLACE` as shipped). All are clipped to [1/8, 1/4] as before.

- **C0** T, unguarded (the reference; not eligible).
- **C1a** frame guard on feature 5: the copy's mean of base feature 5 over its sampled red and blue sensels
  (all of them for test and fresh copies); if outside [min, max] of the same statistic over the training
  copies, the whole copy uses B, else T.
- **C1b** frame guard on all eight base features: as C1a, falling back if any of the eight means is outside
  its training range.
- **C2** per-sensel clamp: B + clip(T - B, -1/64, +1/64).
- **C3** the average (T + B) / 2.

**Choosing on CV (written down now).** Per candidate: mean CV gain over the 120 copies (dB over 3/16), and
the worst frame, where a frame's score is the mean over its three copies of (candidate gain - linear gain).
A candidate is eligible if its mean is at least the linear mean + 0.02 dB **and** its worst frame is no
lower than -0.05 dB. Among eligible candidates the highest mean wins; within 0.005 dB of it, the first in
the order C3, C2, C1a, C1b (simplest first). If none is eligible, nothing goes to test and the flagship
row drops the guarded-tree item.

**Test and fresh, scored once (written down now).** The chosen candidate, fitted on all 120 copies (ranges
for C1a/C1b over all 120), is scored on every red and blue sensel inside the 12-sensel border of the ten
test frames and of the fresh frames, each clean and at SNR 50 and 25 (noise seed 10,000 + the frame's index
in its set), against B as shipped. On each set separately it **passes** if (1) its mean gain is at least
B's + 0.02 dB, (2) no frame's mean over its three copies is below B's by more than 0.05 dB, and (3) it beats
B on at least 60% of copies. C0 and B are reported beside it.

**What a pass means.** A pass on the fresh set, with the test set passing or failing only on the known
K-1 II, makes "ship the guarded tree weight" (numpy inference without lightgbm, then colour PSNR and speed
on whole developed frames) the next item. A fresh-set failure means the boosted weight's gain does not
carry to new cameras reliably enough, and the item is dropped from the row.

## Verdict

(Filled in after the run.)
