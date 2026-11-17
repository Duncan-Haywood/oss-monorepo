---
title: "A longer arm was not why our robust drone design was robust"
date: 2026-11-15
tags: [codesign-cant, quadrotor, flight-control, co-design, research]
description: "A fixed-arm control run shows a robust quadrotor co-design gets its robustness from mass and gains, not its longer arms, which help a fixed tune only a little."
seo_title: "Quadrotor co-design: does a longer frame arm buy robustness?"
---

The last step in the `codesign-cant` programme ended with a guess. We trained a quadrotor co-design to hold position across three centre-of-pressure levers instead of one. Its designs crashed less often at twice the lever than designs trained on one lever, and they had longer frame arms. We read the arm as the reason: a longer arm gives more roll and pitch torque per newton of weight. That reading came from the designs the optimiser happened to choose, not from a controlled run, so this step ran the control.

We did two things and wrote eight predictions into the log before the full run. First, we repeated the robust training exactly, with the arm pinned at the length the one-lever designs use (102 and 103 mm): six seeds, two CMA-ES starts, both centre-of-pressure geometries, 70 minutes on four cores. Second, with no training at all, we took each one-lever design and gave it the robust designs' longer arm, and gave each robust design the shorter arm, changing nothing else. Every design flew the same 64 held-out flights in 26 conditions.

- **Pinning the arm costs no robustness.** At twice the trained lever and a 45° tilt limit, with the cap on the position loop's request, the pinned-arm designs crash on 39 and 46 of 384 flights. With the arm free they crash on 53 and 52; the one-lever designs crash on 73 and 105. The optimiser gets there with mass and gains instead, and again one seed per geometry falls into a heavy, roughly 2 kg design that hardly ever crashes.
- **On a fixed design, a longer arm still helps a little.** Lengthening each one-lever design's arm by 4–7 mm cuts those crashes from 73 to 59 and from 105 to 87, with fewer crashes in 11 of 12 seeds and no loss of tracking.
- **The arm is not free.** In our sizing model the frame gets heavier as the arm grows, so the longer arm adds 4% mass and 6–7% hover power. Torque per weight rises 5–7%. The last post said a longer arm raised torque "without mass". That was wrong: it raises torque faster than mass.
- **Shortening an arm can break a tune.** Half of the robust designs, given the shorter arm, fail the stability-margin test they were trained under. One no longer has room for its propellers.

Six of the eight predictions held. We expected shortening the robust designs' arms to cost little, and over all twelve designs it cost 13–14 crashes. Most of that came from designs the shortened arm had made invalid. Among the six still-valid designs, each moved by −2 to +1 crashes. We also expected lengthening the arms to close less than half the gap between the one-lever and robust designs. In one geometry it closed more than half.

The pinned run also turned up a design worth flagging. One seed settled on an almost uncanted, heavy vehicle with a low position gain. It never crashed, but it tracked twice as badly as the others, and the three-lever training score accepted it. That argues for an objective that weights crashes and tracking separately, which is on the list for a later step.

For a builder: a few millimetres more arm is a cheap robustness margin on an existing tune. It is not what makes a robustly trained co-design robust, and shortening the arm of a tune that sits on its stability margin can push it over. Everything here is simulated, with inherited motor-mass and sizing fits and a simplified acceleration-form position loop rather than PX4's cascade.

Code, results and the full log: [`research/codesign-cant`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/codesign-cant) ([live page](https://marisstella.app/research/codesign-cant/)).
