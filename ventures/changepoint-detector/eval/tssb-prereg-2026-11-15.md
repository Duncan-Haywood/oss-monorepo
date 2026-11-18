# Pre-registration: the shipped settings on TSSB, 75 long labelled series from outside TCPD (2026-11-15)

Written and committed before this detector was run on any TSSB series. The only TSSB numbers looked
at first were the series lengths and change counts (`desc.txt`) and three rows of the published
per-series scores (Adiac, ArrowHead, Beef), read to learn the file format.

**Why.** The flagship `next:` asks for "long labelled series from outside TCPD (none over 991
points)". Every default this detector ships (the six-setting consensus behind the page's "Agreed
changes" line, the over-cut warning and its refit, BOCPD's detections) was chosen on TCPD, whose
series are 15 to 991 points. The Time Series Segmentation Benchmark (TSSB; Ermshaus, Schäfer and
Leser 2023, Data Mining and Knowledge Discovery, doi 10.1007/s10618-023-00923-x; BSD-3 code at
github.com/ermshaua/time-series-segmentation-benchmark, pinned commit
e0c7a1f6cee6874e60cbacd3b8601f2de259606e) has 75 series of 240 to 20,700 points (359,497 in all),
each with its change points annotated, and published per-series segmentation covering for PELT,
BinSeg, BOCD, Window, FLOSS, ESPRESSO and ClaSP (the "unknown number of segments" sheet).

**What TSSB's changes are.** Each series is UCR classification instances grouped by class, each
instance z-scored, concatenated; a change is where the class changes. So within a segment the level
and spread are about 0 and 1, and a change is mostly a change of **shape**, which a level or
volatility model is not built to see. This round is therefore a test of restraint off the product's
domain on long series, plus whatever level or spread differences the classes happen to carry. It is
not a test of whether the detector finds shape changes; the README already says what it models.

**Fixed now.** The settings are exactly those of `eval/tcpd-heldout.mjs` (frozen there on
2026-11-10): level (default), level following the over-cut warning, noise floor 2 local 25 always,
level+volatility, BOCPD detections, consensus every setting, consensus half or more; plus "zero"
(no change). No `--period`, `--log` or anything read from the series. Metrics: TSSB's covering
(identical to TCPDBench's `covering` with one annotator, `eval/tcpd-metrics.mjs`), which is the
primary metric because it is the benchmark's own; F1 with margin 5 (TCPDBench's) and with margin
equal to TSSB's per-series window size, as secondary. Change indexes are cleaned as on TCPD (1 to
n-2). Paired differences: bootstrap over series (10,000, fixed seed) and a sign test, as in the TCPD
scripts. The script is `eval/tssb.mjs`, the fetch `eval/tssb-fetch.sh`; the data is not committed
(the series derive from the UCR archive, which has its own terms).

**Lines.**

- T1 (the page's headline does no harm off-domain). The every-setting consensus's mean covering is
  at least zero's minus 0.02.
- T2 (the level model over-cuts long series, and says so). The over-cut warning fires on at least
  50 of the 75 series.
- T3 (following the warning helps where it fires). Following it beats the plain level model on
  covering on more series than it loses, sign test p < 0.05 over the series where it fires.
- T4 (as good as the published level detectors). The every-setting consensus's mean covering is
  within 0.05 of published PELT's (0.581) and BinSeg's (0.575), or above them.

**What each outcome changes.** If T1 fails, the "Agreed changes" headline over-claims on long series
and the page needs a guard (to be designed in a later, separately pre-registered round; this round
only measures). If T1 holds, the README and the page's limits say, with the numbers, that changes of
shape at a constant level and spread are outside what the detector finds, and name a shape-aware
method (ClaSP) for that job. T2 to T4 are descriptive; none changes a default.

**Predictions.** T1 met (the consensus is conservative: on measles it kept 1 change of 167). T2 met.
T3 met. T4 met, with the consensus near zero's covering. No setting here comes within 0.15 of
ClaSP's 0.855. Level (default) is the worst setting by covering, under 0.35. BOCPD over-cuts on the
long series more than on TCPD, and scores below zero.
