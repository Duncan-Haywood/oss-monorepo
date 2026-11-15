---
title: "When every setting agrees on a heartbeat: a changepoint detector tested on 75 long series it was not built for"
seo_title: "Changepoint consensus on TSSB: agreement is not evidence"
date: 2026-11-15
tags: [changepoint-detection, benchmarks, pre-registration, negative-result, time-series]
description: "Pre-registered on 75 long TSSB series: agreed changepoints scored 0.344 covering vs 0.401 for none; on repeating waveforms every setting agrees on the cycle."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) leads its results with "Agreed changes": the dates that all six of its settings find. That headline was chosen on the Turing Change Point Dataset. There, on seven series held out from every choice, the agreed changes scored F1 0.711, against 0.639 for reporting no change at all. But TCPD's longest series is 991 points. Nobody had checked what the headline does on long series.

Today's test used the [Time Series Segmentation Benchmark](https://github.com/ermshaua/time-series-segmentation-benchmark) (TSSB; Ermshaus, Schäfer and Leser 2023): 75 labelled series of 240 to 20,700 points, with each published method's per-series score. TSSB builds each series by concatenating UCR classification examples grouped by class, and each example is z-scored first. So a labelled change is mostly a change of shape, at the same level and spread. This detector doesn't model that. The question was narrower: off its own ground, does the headline stay quiet?

The four pass/fail lines and the predictions were committed before the first run ([pre-registration](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/changepoint-detector/eval/tssb-prereg-2026-11-15.md)). The settings were the ones frozen for TCPD's held-out check. Nothing was tuned.

| 75 TSSB series, segmentation covering | score |
|---|---|
| ClaSP (published; a shape method) | 0.855 |
| PELT as TSSB ran it (published) | 0.581 |
| report no change | 0.401 |
| **agreed changes (the page's headline)** | **0.344** |
| level model, following its over-cut warning | 0.304 |
| level model, plain | 0.094 |

**The main line failed.** The agreed changes scored 0.057 below reporting nothing. The 95% bootstrap interval was -0.099 to -0.022: worse on 15 series, better on 1. Most series were fine: 59 of the 75 got no agreed change. The other 16 got 579 between them, and only 7 of those (1%) fell near a labelled change. Those 16 are mostly repeating waveforms: ECG traces, eye-movement signals, gun-point and trace gestures, spectra. Every setting cuts at the same peaks, so they all agree. Here, agreement says nothing about whether a change happened.

**What held.** The over-cut warning fired on 61 series. Following it beat the plain level model on 59 of those, as it did on TCPD.

**A wrong assumption, written down.** The pre-registration expected TSSB's published PELT to score about the same as reporting no change. It scored 0.18 higher, so that line failed too. The runs TSSB published found shape changes that a mean-shift cost can't see.

**What changes.** As registered, this round only measured, so no default moved. The page, the README and `llms.txt` now say that a change of shape at an unchanged level is outside what the tool finds. They also say that on long repeating waveforms the agreed changes can be the cycle itself, and they point to a shape method (ClaSP) for that job.

The detector's existing cycle warning would not have caught these series: it fired on 3 of the 15 worst. The count of agreed changes does mark them. TCPD's 31 series got 59 agreed changes between them. Here, 14 single series got between 23 and 50 each. The next round will pre-register a "many evenly spread agreed changes" guard and test it on TCPD, where it must stay quiet, and on a fresh set.

Reproduce: `sh eval/tssb-fetch.sh tssb-data && node eval/tssb.mjs tssb-data` in `ventures/changepoint-detector` (2.4 minutes on four cores; the data is fetched, not committed). The full table is in the README, under "Long series from outside TCPD".
