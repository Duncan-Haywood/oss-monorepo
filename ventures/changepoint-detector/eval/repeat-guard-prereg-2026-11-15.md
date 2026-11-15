# Pre-registration: a guard for many agreed changes spread through a series (2026-11-15)

Written and committed before the guard below was run on any series. What was already known when it
was written: the committed TSSB output (`eval/tssb.out.txt`: per-series counts of every-setting
changes, 14 series with 23 to 50 of them) and `eval/tssb-cycle.out.txt`; on TCPD, the shipped 31
series got 59 every-setting changes between them and the 7 held-out at most 12 on one series
(README). Nothing about where in a series the agreed changes fall, or how they are spaced, was
looked at. The fresh set (HAS 2023, below) was opened only to count its series, lengths and
labelled changes (250 series, 340 to 41,465 points, 1,929,951 in all, 785 labelled changes); no
values were plotted or run.

**Why.** On TSSB (README "Long series from outside TCPD") the page's headline, "every setting agrees
on these changes", scored covering 0.344 against 0.401 for reporting no change: 16 series got 579
agreed changes, 1% of them near a labelled one, and most of those series are long repeating
waveforms whose peaks every setting cuts. The round asked for a guard on "many agreed changes,
evenly spread", checked on TCPD (where it must stay quiet) and on a fresh set.

**The guard (fixed now; `consensus.mjs` `repeatGuard`).** Take the every-setting ("all" tier)
change indexes of one series of length n. The guard fires when both hold:

1. there are at least **15** of them (TCPD's most on any one series is 12), and
2. they fall in at least **8 of the 10** equal tenths of the series (spread through it, as a
   repeating pattern's cuts are, rather than clustered where something happened).

When it fires, the page, CLI and report keep listing the agreed changes but stop calling them the
changes to trust: the headline says they are many and spread through the whole series, which is what
a repeating pattern produces, and that they are candidates. For scoring, a guarded series reports no
agreed change ("guarded every-setting" = every-setting, or none where the guard fires). Nothing reads
labels, the period, or the series' values beyond the agreed indexes and n.

A second arm is descriptive only and decides nothing: condition 1 alone (count at least 15).

**Data.**

- TSSB, 75 series (`eval/tssb-fetch.sh`, pinned e0c7a1f), the cached detections of `eval/tssb.mjs`.
  A **seen** set: the guard was designed on its counts.
- TCPD, the 31 shipped and 7 held-out univariate series (`eval/tcpd-fetch.sh`), every setting exactly
  as `eval/tcpd-heldout.mjs`.
- **Fresh:** the Human Activity Segmentation Challenge 2023 set (HAS; Ermshaus, Schäfer and Leser,
  ECML PKDD 2023 challenge; github.com/patrickzib/human_activity_segmentation_challenge,
  `datasets/has2023_master.csv.zip`, CC BY-NC-SA 4.0, so it is fetched and never committed): 250
  smartphone recordings of people moving through routines of activities (walking, running, jumping
  jacks, sitting, climbing stairs and so on), each labelled with where the activity changes. Both
  splits (public and private) are used. The one series per recording is the **accelerometer
  magnitude** sqrt(x² + y² + z²), the axis-free reading of how hard the phone is moving; no other
  channel, no resampling, no smoothing. Unlike TSSB, an activity change often moves the level and
  spread of that magnitude, so this is closer to the detector's domain, and many recordings are
  repeating motions (steps, jumps), so it can show both a guard that helps and one that hides real
  changes.

**Metric.** Covering with one annotator (`eval/tcpd-metrics.mjs`, identical to TSSB's), the primary
metric, as in the TSSB round; F1 at margin 5 for TCPD (its own metric, all annotators). Paired
differences: bootstrap over series (10,000, fixed seed) and a sign test.

**Lines.**

- G1 (TSSB, seen; the guard repairs the headline). Guarded every-setting covering is at least zero's
  minus 0.02 (0.381; unguarded was 0.344).
- G2 (TCPD stays quiet). The guard fires on none of the 38 univariate TCPD series, so their F1 and
  covering are unchanged. Expected from the counts above; it is a regression line, not evidence.
- G3 (fresh, no harm). On HAS, the guarded every-setting covering minus the unguarded is at least
  -0.005 in the mean, and over the series where the guard fires it is better on at least as many as
  it is worse. If the guard fires on fewer than 5 HAS series, G3 is reported as "not informative"
  and the guard does not ship.

**What each outcome changes.** G1, G2 and G3 all met: the guard ships as the default in
`consensus()` (its result carries `repeatWarning`), the page's agreed-changes headline, the CLI's
consensus text and `llms.txt`. Any line not met: the guard is measured, not offered, and the README
says which line failed. The descriptive arm (count only) changes nothing either way.

**Also reported, deciding nothing.** HAS: every setting's covering against zero (does the TSSB
finding, consensus below zero, hold on a set nearer the domain?), and how many agreed changes lie
within 2% of the series length of a labelled change.

**Predictions.** G1 met (most of TSSB's damage is on the 14 series with 23 or more agreed changes,
and those are repeating waveforms). G2 met. G3 met, with the guard firing on 10 to 60 HAS series. On
HAS the every-setting consensus scores above zero's covering (activity changes move the level).
