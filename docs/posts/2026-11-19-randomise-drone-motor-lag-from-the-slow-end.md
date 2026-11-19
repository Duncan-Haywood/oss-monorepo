---
title: "Randomise a drone's motor lag from the slow end: eleven training ranges, one table, pooled tests"
seo_title: "Domain randomisation range for drone motor lag: what 11 tunes show"
date: 2026-11-19
tags: [research, robotics, drones, quadrotor, sim-to-real, domain-randomisation]
description: "Training a simulated quadrotor on exactly the measured motor-lag range crashed most; anchoring at the slow end with a 3-4x ceiling cut crashes by four fifths."
---

Over the past week our [rotor-cant co-design programme](../../research/codesign-cant/README.md) retrained the same simulated 5-inch quadrotor eleven times. Each run used a different range for the motor lag drawn in training. [This morning's run](2026-11-19-drone-motor-lag-training-range-has-no-sharp-knee.md) was the last of that series. Each step had been read on its own, with six seeds per geometry, and most comparisons between neighbouring ranges came out "probable, not measured". This run fits no new designs. It writes the series up as one section of the [paper draft](../../research/codesign-cant/paper/DRAFT.md) and asks which differences survive a test with more power.

## The question a builder actually has

Two published identifications of brushless 5-inch quadrotors put the first-order motor lag at 33 ms (NeuroBEM) and 39.1 ms (Agilicious). A builder rarely has an identification of their own. Like any domain-randomised tuner, ours draws a plant lag for every training episode, so the range it draws from is a design choice. Should it cover exactly 33-39 ms? Should it sit at the slow end, or reach well past it?

## What we did

We built Table VII-1 straight from the eleven results files. A script generates each row, and the paper's number check fails if a row in the draft differs from the data. We then pooled the two centre-of-pressure geometries, which gives 12 designs a side instead of 6. On those pooled sets we ran permutation Mann-Whitney tests, a Jonckheere-Terpstra trend test along the ceilings, and stratified bootstrap intervals ([`table7_stats.py`](../../research/codesign-cant/paper/table7_stats.py), stdlib, fixed seed). All of these tests are post hoc, chosen after the data were seen.

## What it shows

The table counts flights that diverge in a stress test: twice the trained centre-of-pressure lever, a 45° tilt limit, summed over the 33, 36 and 39.1 ms laws.

- **Matching the training range to the uncertainty was the worst choice.** Drawing 33-78.2 ms crashed on 486 of 2,304 flights. Moving only the floor to the slow identification (39.1-78.2 ms) gave 348 (p = 0.011). In the original per-cell tests this gap never reached p < 0.05.
- **The ceiling buys the robustness, not the floor.** With a 150 ms ceiling, a 39.1 ms floor and a 75 ms floor are indistinguishable: 65 against 62 crashes, p = 0.83. With the floor at 39.1 ms, raising the ceiling through 78.2, 100, 125, 150 and 200 ms gives 348, 191, 101, 65 and 53 crashes. The decreasing trend sits at the permutation floor in both geometries.
- **Most of the gain arrives by about 125 ms**, 3.2 times the slow identification. Neighbouring ceilings separate up to 125 ms (p = 0.018 and 0.025) and not after (p = 0.10 and 0.16). For a motor slower than either identification (75 ms), every extra step of ceiling still pays (all p ≤ 0.0002).
- **The price is response, not crashes.** Rise time to 90% of a 1 m step grows from 1.44 s at a 78.2 ms ceiling to 2.0-2.3 s at 200 ms.

## What it means, and what it does not

For a builder the rule is short. Anchor the randomised lag at the slowest identification for your motor class, never draw faster plants than that, and set the ceiling at 3-4 times it. All of this is simulated, in one model with one controller family. The ceilings are brackets, not sourced values, and the pooled tests treat the two geometries as exchangeable. The section offers one mechanism: a mean-over-episodes objective trades margin at the slow edge for tracking of fast plants. The draft labels that a reading, not a tested claim. Next come the section's two figures and the same sweep on the torque-scale and mass ranges, which are still randomised over unswept intervals.
