---
title: "Wavy studs: a sheathing robot should read the stud at every nail, not fit a curve"
date: 2026-11-13
tags: [buildbot-sheathing, construction-robotics, lumber, sensing, real-data]
seo_title: "Robot nailing on wavy 2x4 studs: per-nail sensing vs curve fitting"
description: "On six scanned 2x4 studs, aiming each nail at its own stud reading beats a fitted curve; all fixes together give 77% clean sheets, doubled joints 100%."
---

This morning's step of the `buildbot-sheathing` programme found that real studs are not parabolas. Six installed 2x4s from a public laser scan of a robot-built wall bow by the published amount, but each has about a millimetre of waviness. On single-stud joints, that waviness cut the robot's clean-sheet rate (sheets with all 62 nails on wood) from 58% to 43%. The same step found that 17 reads per stud didn't help much, which looked like bad news for sensing.

The next question was whether that was a sensing problem or a geometry problem. The 17 reads were still fitted to a parabola, so they couldn't follow the waviness either. This step tests the alternative: read the stud at every nail height and aim each nail at its own reading, with no curve. It also reruns the programme's two earlier single-stud fixes on the measured studs. One pushes the joint stud straight at mid-height. The other slides and shims the sheet before tacking it.

- **Per-nail reads recover most of the loss.** Clean sheets rise from **42.5% to 53.0%**, against 57.9% if the same studs were perfect parabolas. Waviness now costs 4.7 points instead of 15.4. On parabolic or straight studs the same reads gain nothing, so their only value is the waviness.
- **Pushing the stud straight still pays: +12.6 points** with three reads (milestone 9 found +16 on parabolas). It takes 10–72 N. Four of the six studs come out straighter. The worst-leaning end stud comes out less straight, because its shape is not a bow.
- **Together the fixes reach 77%, not 90%.** Per-nail reads, the push, and a 0.5 mm slide and shim give **0.771** clean sheets. The same studs as parabolas give 0.860, and straight studs about 0.92. To hit 95%, the nail gun's 1σ scatter would have to shrink from 0.9 mm to **0.61 mm**.
- **Doubled joint studs: 100%** in every combination, with none of the fixes.

We registered four hypotheses in the log before running anything. Three held: per-nail reads close at least half the gap, the push adds at least 10 points, and doubled joints stay at or above 99%. One was refuted: the fixes together do not reach 90%.

We also caught our own bug before using any result. The scanned profiles are stored about each stud's best-fit line, not the line through its ends. Our first run measured the push from the wrong line, which made pushing look useless. The fix and a test for it went in before the results were written up.

The limits haven't changed. The data is one wall of six studs, built by robots. The slide, shim and push accuracies come from a sweep, not a measurement. Part of the waviness may come from the scanner. The next step for the single-stud route is a real line-laser read along a stud on a robot, timed, because reading 24 points where three used to do costs time. Code, numbers and figure: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
