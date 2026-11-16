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

**Not shipped: the guard passes the clean fresh set and fails the test set on two frames it cannot see.**

- **CV chose C1b** (fall back to B for the whole copy when any of the eight frame means is outside the
  training range): +0.518 dB over 3/16 against the linear refit's +0.386 on the same folds, worst frame
  -0.025 dB (Nikon D200), better than the linear weight on 90 of 120 copies. It fell back on 27 copies
  (12 frames). C1a and C3 had higher or similar means but the LX7 is 0.057 and 0.059 dB below linear under
  them, past the -0.05 floor; C2 (the clamp) was eligible with a lower mean (+0.459). The unguarded C0
  reproduces the boosted note's +0.527 exactly, a check that the run is the same model.
- **Fresh set (six cameras no earlier note used; clean): pass.** C1b +0.398 dB against B's +0.242, no
  frame below B (worst 0.000), better on 15 of 18 copies. The guard earned its place here: the Canon R8
  (`cr3/IMG_0036.CR3`) is out of range on at least one feature, and the unguarded trees are at -0.72 to
  -0.74 dB there, 0.65 dB below B, which is itself below 3/16 on that frame (-0.07 to -0.10). Without the
  guard the fresh set fails (C0 worst frame -0.647).
- **Test set (ten frames; contaminated by the K-1 II being known): fail.** C1b +0.437 against B +0.406,
  17 of 30 copies (bar 18), and two frames below the -0.05 floor: the K-1 II (-0.489) and the A7 III
  (-0.118). Both are inside the training range on all eight frame means on every copy, so the guard never
  fires on them; it fires on the A7 IV (all three copies), one 70D copy and two NX1 copies, where it gives
  back small gains.

The pre-registered rule for shipping asked for a fresh pass with the test set failing *only* on the known
K-1 II. The A7 III is a second miss, so the guarded tree weight is not the next thing to ship.

**What it says.** Frame-level ranges catch a camera whose statistics are new (the R8) and miss two whose
statistics look ordinary but whose fine texture the trees read wrongly. A guard that would catch those
needs a signal tied to the error, not to the feature distribution, and choosing one now would be tuning on
the ten test frames. The sample set has no unused Bayer files left (the rule above took all six), and
raw.pixls.us refused this session, so a further guard has no clean set to be judged on here.

| CV, five folds (mean dB over 3/16) | linear | C0 | C1a | **C1b** | C2 | C3 |
|---|---|---|---|---|---|---|
| clean (40) | +0.321 | +0.472 | +0.469 | **+0.450** | +0.403 | +0.449 |
| SNR 50 (40) | +0.391 | +0.531 | +0.535 | **+0.528** | +0.465 | +0.511 |
| SNR 25 (40) | +0.445 | +0.578 | +0.582 | **+0.575** | +0.510 | +0.564 |
| all (120) | +0.386 | +0.527 | +0.529 | **+0.518** | +0.459 | +0.508 |
| worst frame vs linear | | | -0.057 | **-0.025** | -0.047 | -0.059 |
| copies below 3/16 | 12 | 2 | 2 | **2** | 6 | 3 |

Per frame, C1b minus B (mean of three copies, dB). Test: 70D +0.047, D810 +0.141, A7 III -0.118,
E-M10 +0.172, K-1 II -0.489, A7 IV 0.000 (fell back), D800E +0.189, 7D +0.148, GF7 +0.179, NX1 +0.042.
Fresh: R3 +0.068, R8 0.000 (fell back; unguarded -0.647), 10D +0.229, Kodak DCS Pro SLR/n +0.217,
Leica D-LUX (Typ 109) +0.406, Leica V-LUX (Typ 114) +0.019.

The fresh set's gains over B are the largest seen for this model (the D-LUX +0.41 dB, the two older
CCD-era bodies +0.22). B is weak on the 10D and the Kodak (+0.00 to +0.30), so there is room there.

Rows: `eval/bayer-boosted-guard-2026-11-16.jsonl` (one `cv_copy` row per training copy with every
candidate and both fallback flags, the CV choice and summary, the full-model training ranges, one row per
test and fresh copy, and each set's verdict for the chosen candidate and C0). The fresh-set rule's
decisions per file: `eval/bayer-boosted-guard-fresh-pick-2026-11-16.jsonl` (CR3 R8 kept once of four;
four Issue 247 NEFs and the Issue 419 RW2 unreadable by LibRaw 0.22.2; X-E1 and X-E2 RAFs are X-Trans;
the S5500 has 4.0 million sensels).

## numpy inference without lightgbm

`src/shootflow/tree_ensemble.py` flattens a LightGBM `dump_model()` into one node table (feature,
threshold, left, right, value, NaN direction) and evaluates it with numpy, a tree at a time and a level per
step, so a developer can apply a tree weight with no lightgbm installed. `tests/test_tree_ensemble.py`
checks hand-written trees (NaN handling for missing types None and NaN), refuses categorical splits, and
matches `Booster.predict` to 1e-9 on a 40-tree model. On the full model (400 trees, 50,000 nodes, deepest
path 22; `--export`) and the 70D test frame's 602,775 red and blue sensels, the numpy walk equals
`Booster.predict` exactly (largest difference 0.0). It is slow: 217 s walking every row to the deepest
level, 58 s after carrying only the rows not yet at a leaf, against 3.7 s for lightgbm's C++ on four
threads. A 24 MP frame has about 12 million such sensels, so the numpy path is a reference, not a
developer path; a tree weight that ever ships needs the walk in the existing C module.

## Commands (from `ventures/photo-editing`; the sample set is not committed)

    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set arw cr2 cr3 crw dcr dng nef orf pef raf rw2 rwl srw)
    pip install rawpy numpy lightgbm
    PYTHONPATH=src:tools python tools/bayer_boosted_guard.py --pick-fresh mei/cr3/* mei/crw/*.crw mei/dcr/*.dcr \
        mei/rwl/*.rwl mei/raf/*.raf "mei/nef/Issue 247-"*.nef "mei/rw2/Issue 419.rw2"
    PYTHONPATH=src:tools python tools/bayer_boosted_guard.py --train <the 40 files of eval/bayer-learned-train-frames.txt> \
        --test <the 10 test files, in tools/bayer_laplace_train.TEST_FRAMES order> --fresh <the six fresh files> \
        --cache DIR --noise-snr 50 --noise-snr 25 > eval/bayer-boosted-guard-2026-11-16.jsonl

Python 3.11, rawpy 0.28 (LibRaw 0.22.2), numpy 2.4, lightgbm 4.7, four CPUs: about 75 minutes, most of it
building the 120 training copies' features.

## Tests

`tests/test_bayer_demosaic.py::DirectionalTests::test_boosted_guard_tool` (the fallbacks fire only out of
range, the clamp stays within 1/64 of B, the CV rule's eligibility, floor and tie order, the test bars) and
`tests/test_tree_ensemble.py`.
