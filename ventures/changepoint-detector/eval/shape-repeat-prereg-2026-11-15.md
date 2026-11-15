# Pre-registration: a shape-repeat check on the agreed changes (2026-11-15)

Written and committed before the check below was computed on any series. What was already known
when it was written: everything in the README's "Long series from outside TCPD" and "Many agreed
changes spread through a series" sections (`eval/tssb.out.txt`, `eval/repeat-guard.out.txt`): the
per-series counts and spread of every-setting changes on TSSB, TCPD and HAS 2023, and their
covering. Nothing about the **shape** of the values between agreed changes was computed or plotted
on any set. The fresh set (UTSA, below) was opened only to list its 32 file names (which carry the
labels) and count their lines; no values were read, plotted or run.

**Why.** The count-and-spread guard (`repeatGuard`) failed on HAS because a routine of several
activities spreads agreed changes through a recording just as a repeating waveform does; the round
ended: "a next guard would need a reading of the waveform between cuts (are the segments the same
shape repeated?), not their count or spread." This is that round.

**The check (fixed now; `consensus.mjs` `shapeRepeats`).** Take the every-setting ("all" tier)
change indexes c_1 < ... < c_k of one series and its values. They cut it into k + 1 segments
(the first from index 0, the last to the end).

1. Each segment of at least 4 points is reduced to a **shape**: resampled to 32 points (the mean of
   each of 32 equal bins when it has 32 or more points, linear interpolation otherwise), then
   z-normalised (mean 0, sd 1). A segment under 4 points, or one whose resampled sd is 0, has no
   shape.
2. Two segments **match** when both have a shape, their lengths are within a factor of 1.5 of each
   other, and the Pearson correlation of their shapes is at least **0.8**.
3. A segment **repeats** when it matches at least **2** other segments of the same series.
4. An agreed change is a **repeat cut** when the segments on both sides of it repeat.

The **shape-filtered every-setting** answer drops the repeat cuts and keeps the rest. It needs at
least 3 agreed changes (so at least 4 segments) to drop anything. Nothing reads labels, the period
or any other setting's cuts. Why this should separate the two cases: a repeating waveform cut at the
same phase every cycle gives segments that are the same shape over and over; a routine of
activities gives segments that are different activities (different shapes, or noise with no
stable shape once resampled), and a staircase of real level shifts gives flat segments whose
z-normalised shape is noise.

**Arms.** Primary: the shape filter on every series. Secondary (deciding nothing): the shape filter
only where `repeatGuard` (count 15, 8 of 10 tenths) fires.

**Data.**

- TSSB, 75 series (`eval/tssb-fetch.sh`, pinned e0c7a1f), the cached detections of `eval/tssb.mjs`.
  **Seen** for counts and covering; the shape was never computed.
- TCPD, the 31 shipped and 7 held-out univariate series, every setting as `eval/tcpd-heldout.mjs`.
- HAS 2023, 250 recordings, accelerometer magnitude, the cached detections of
  `eval/repeat-guard.mjs`. **Seen** for counts and covering; the shape was never computed.
- **Fresh: UTSA**, the UCR Semantic Segmentation Benchmark (Gharghabi, Ding, Yeh, Kamgar, Ulanova
  and Keogh, "Matrix Profile VIII", ICDM 2017; `https://www.cs.ucr.edu/~eamonn/FLOSS/datasets_seg.zip`,
  sha256 83013803203ce47e96e2dcbba3b858f762299441c64425c877921f41120a3d4b as fetched on 2026-11-15;
  not committed, fetched by `eval/utsa-fetch.sh`): 32 real series of 2,000 to 40,000 points,
  mostly physiological and mechanical repeating signals (ECG, arterial pressure, EEG, insect EPG,
  gait, robot dog, power demand) with one or two labelled regime changes. Each file name is
  `name_window_cp1[_cp2].txt`; the labels are read from it, the values are the file's one column,
  used as they are.

**Metric.** Covering with one annotator (`eval/tcpd-metrics.mjs`), as in the TSSB and HAS rounds;
TCPD also F1 at margin 5 with all annotators. Paired differences: bootstrap over series (10,000,
fixed seed) and a sign test.

**Lines.**

- S1 (TSSB, seen). Shape-filtered covering is at least zero's minus 0.02 (0.381; unfiltered was
  0.344, the count guard reached 0.403).
- S2 (TCPD, no harm). Over the 38 series, shape-filtered mean F1 and mean covering are each at
  least the unfiltered value minus 0.005.
- S3 (HAS, seen, no harm). Shape-filtered minus unfiltered covering is at least -0.005 in the mean
  (the count guard was -0.008).
- S4 (UTSA, fresh). Shape-filtered minus unfiltered covering is at least 0 in the mean, and over the
  series where it drops anything it is better on at least as many as it is worse. If it drops
  anything on fewer than 5 UTSA series, S4 is "not informative" and the check does not ship.

**What each outcome changes.** S1 to S4 all met: `consensus()` marks repeat cuts (`repeat: true`
on the change, a `shapeRepeatWarning` on the result), the page's agreed-changes headline, the CLI
and `llms.txt` stop counting them as agreed changes and say why. Any line not met: the check is
measured, not offered, `shapeRepeats` stays in `consensus.mjs` for the eval, uncalled by
`consensus()`, and the README says which line failed.

**Also reported, deciding nothing.** The secondary arm on all four sets; how many cuts the filter
drops on each set; UTSA's every-setting covering against zero's; on UTSA how many agreed changes lie
within the file's window of a labelled change.

**Predictions.** S1 met (TSSB's damage is on repeating waveforms). S2 met (TCPD's agreed changes
are few and sit between flat-ish stretches). S3 met but narrowly, with the filter dropping cuts on
some repeated-motion recordings. S4 met, with the filter dropping cuts on 10 to 25 UTSA series. On
UTSA the unfiltered every-setting consensus scores below zero (as on TSSB).
