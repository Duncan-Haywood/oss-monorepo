---
title: "A guard against repeating waveforms that fixed one benchmark and broke on fresh activity data"
seo_title: "A changepoint guard for repeating patterns: fixed TSSB, failed HAS"
date: 2026-11-15
tags: [changepoint-detection, statistics, pre-registration, negative-result, benchmarks]
description: "Pre-registered: a guard for repeating waveforms repaired TSSB but cost covering on 250 fresh activity recordings, where the headline beat no-change by 0.175."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) leads with the changes that all six of its settings agree on. Earlier today that headline failed a test on TSSB, a benchmark of 75 long series made of repeating waveforms such as heartbeats, eye movements and gestures. All six settings cut the same peaks of each cycle, so they agreed on dozens of "changes" that were really the cycle repeating. On that benchmark the headline scored below simply reporting no change (covering 0.344 against 0.401).

The obvious fix: when there are many agreed changes and they are spread through the whole series, call them a repeating pattern rather than changes. Before running it on anything, I wrote down the rule: 15 or more agreed changes, falling in at least 8 of the series' 10 tenths. I also wrote down three tests it had to pass.

| covering | TSSB (seen) | HAS 2023 (fresh) |
|---|---|---|
| report no change | 0.401 | 0.444 |
| agreed changes, as shipped | 0.344 | **0.619** |
| agreed changes, with the guard | **0.403** | 0.611 |

**It fixed the benchmark it was designed on.** On TSSB the guard fired on exactly the 14 waveform series. Scored, the guarded headline came to 0.403, no worse than reporting nothing.

**It failed the other two tests.** On the Turing Change Point Dataset it should have stayed silent, and it fired once, on a bank series with 30 agreed changes. My pre-registration assumed no TCPD series had more than 12. That number was true of the 7 held-out series only, and I had not checked the other 31 one by one. The fresh set was the Human Activity Segmentation Challenge 2023: 250 phone recordings of people moving through routines of activities (jumping jacks, planks, walking, stairs), 1.9 million points in all. There the guard cost 0.008 covering and did worse on 20 of the 31 recordings where it fired. A routine of several activities spread over a recording produces many evenly spread agreed changes too, and those are real. On one recording with 8 labelled activity changes, hiding them took covering from 0.743 to 0.117. Counting cuts and checking where they fall cannot tell a cycle from a routine, so the guard does not ship.

**The better news is the fresh set itself.** On a labelled set nearer what the detector is built for (activity changes move the level and spread of how hard the phone is shaking), the agreed-changes headline beat "no change" by 0.175 covering. It was better on 160 recordings and worse on 32, with about one cut per thousand points. That makes three labelled sets the headline has been scored on: it does well where changes move the level or spread, and badly on changes of waveform shape, which the page's limits already say.

What a better guard would need is a look at the segments themselves: are the pieces between the cuts the same shape repeated? That is the next item. Script, data fetch (with a pinned checksum; the data is not redistributed), output and the pre-registration are in the tool's README, "Many agreed changes spread through a series".
