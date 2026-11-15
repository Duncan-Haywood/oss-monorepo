---
title: "A shape check for repeating waveforms: it never made a series worse, and still failed its test"
seo_title: "A changepoint shape check: safe on four benchmarks, too timid on TSSB"
date: 2026-11-15
tags: [changepoint-detection, statistics, pre-registration, negative-result, benchmarks]
description: "Pre-registered: dropping agreed changes between repeated segment shapes helped on a fresh set of 32 signals and hurt nowhere, but fell short on TSSB."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) leads with the changes all six of its settings agree on. On long repeating signals (heartbeats, gestures, pressure traces) that headline misleads: every setting cuts the same peaks, so they "agree" on dozens of changes that are just the cycle. An [earlier guard](2026-11-15-changepoint-repeat-guard-fails-on-activity-data.md) looked only at how many agreed changes there were and how evenly they were spread. It fixed one benchmark and then hid real changes on phone recordings of people switching activities, because a routine of activities spreads its changes evenly too.

That round ended with a question: are the pieces between the cuts the same shape repeated? This round tests it. Before running anything I wrote the rule down. Cut the series at the agreed changes. Squash each piece to 32 points and rescale it. Two pieces match when their lengths are within 1.5x of each other and their shapes correlate at 0.8 or more. A piece repeats when it matches at least two others. An agreed change is dropped when the pieces on both sides of it repeat. I also wrote down four tests it had to pass, including one on a fresh set: the UCR Semantic Segmentation Benchmark, 32 real physiological and mechanical signals, each with one or two labelled regime changes. Nothing in this project had used that set before.

| covering (higher is better) | TSSB, 75 | HAS 2023, 250 | UTSA, 32 (fresh) |
|---|---|---|---|
| report no change | 0.401 | 0.444 | 0.512 |
| agreed changes, as shipped | 0.344 | 0.619 | 0.458 |
| with the shape check | 0.365 | 0.620 | **0.522** |

**It never made a long series worse.** Across 357 series on three benchmarks, covering went down on none of them. On the fresh set it helped on all five signals it touched: a gun-draw motion, two pig blood-pressure traces, and a tilt-table blood pressure and ECG. On those the headline had listed 34 to 50 agreed changes against one real one, and the check dropped 23 to 47 of them. On the activity recordings that broke the earlier guard, it dropped 21 of 2,220 agreed changes, so the real activity switches survived. On the Turing Change Point Dataset it cost one true change on one series (bitcoin).

**It still failed, on the benchmark that started all this.** On TSSB the bar was 0.381 (no change, minus 0.02). The check reached 0.365. It helped every TSSB series it touched, but it only touched 11 and dropped about a fifth of the bad cuts. On most of TSSB's waveforms the settings cut each cycle at slightly different points, so neighbouring pieces differ a little in length or shape and don't count as repeats. The check is safe but timid. The rule said any failed test means it does not ship, so the page's headline is unchanged.

The run also turned up a bug in the earlier round's script. It read a warning field the detector no longer sets, so a rerun quietly reported a failed test as passed. The committed results were right. The rerun path now computes the guard itself and reproduces them.

The next candidate is matching shapes with some slack for where in the cycle the cut falls. It has to be tested on a fifth labelled set, because these three have now all helped shape the idea. The rule, script, data fetch (with a pinned checksum; the data is not redistributed) and full output are in the tool's README, under "Agreed changes that are the same waveform repeated".
