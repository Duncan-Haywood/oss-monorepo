---
title: "How long should a drone's arms be? Longer, until the design stops being valid"
date: 2026-11-15
tags: [codesign-cant, quadrotor, flight-control, co-design, research]
description: "Sweeping the arm on 48 fixed quadrotor tunes: gust crashes fall as the arm grows, with no best length, until the design stops being valid."
seo_title: "Quadrotor arm length vs gust robustness: a simulation sweep"
---

The last step in the `codesign-cant` programme found that lengthening a quadrotor's frame arm by 4–7 mm, with the controller tune left alone, cut its crashes at twice the trained centre-of-pressure lever by about a fifth. That was one swap per design. This step swept the whole range to find the shape of the curve.

We took 48 fixed designs from four earlier training runs (six seeds, two centre-of-pressure geometries each) and changed only the arm, from 85 to 135 mm in 5 mm steps. Every point flew the same 64 held-out flights at four conditions. We ran two versions of the sizing model. In the full one, a longer arm adds frame mass, inertia, frontal area and centre-of-pressure lever, so it adds gust torque as well as control torque. In the second, the area and lever stay at the design's own values, which isolates what the extra gust exposure costs. Seven predictions went into the log before the run. The whole sweep took under six minutes on four cores.

- **Longer keeps helping. There is no sweet spot.** At twice the lever and a 45° tilt limit, the designs trained at one lever go from 62 crashes out of 384 flights at 105 mm to 6 at 130 mm in one geometry, and from 103 at 105 mm to 44 at 135 mm in the other. Among the 46 designs with at least three valid points, none has a curve that turns back up. We had given a turning point even odds. It never appeared.
- **What stops you is validity.** Shorten a design below the length it was tuned at and it fails the stability-margin test the tuner trained under: 47 of 48 designs fail at 85 mm, and none fails at or above its own length. Lengthen it and the frame mass feeds the battery and the motors. One set gains 26% mass and 42% hover power by 120 mm, and 98% mass and 188% power by 135 mm. The heaviest designs run into the cost cap from 110–120 mm.
- **The extra gust exposure costs up to a third of the gain.** With frontal area and centre-of-pressure lever held fixed, the worst set falls to 12 crashes at 135 mm instead of 44.
- **A longer arm alone can match the robustly trained designs.** The previous two steps trained designs across three centre-of-pressure levers. Taking the one-lever tune and lengthening only its arm, to 110 mm in one geometry and 135 mm in the other, reaches the same crash count (52 against 53, 44 against 52) at slightly lower mass and hover power, with the same tracking. The tuners stop short because their scores barely look at the doubled lever and charge for mass through hover power. Longer arms still help where they stop.

Five predictions held. Two were refuted: the interior optimum, and our guess that tracking would stay flat. Single crashed flights swing a seed's average cost too much for that.

One methods lesson came out of a failed first run. The script rounded each design's arm to six decimal places, and that sub-micron change flipped one marginal flight, enough to put the baseline counts off by one or two. We now score each design's own coordinates untouched. Any single-flight difference between two nearly identical designs here is noise.

For a builder: on an existing tune, lengthen arms rather than shorten them, because a shorter arm can push a tune past its stability margin. Stop where hover power starts to climb steeply. Everything here is simulated. The frame-mass, frontal-area and centre-of-pressure laws are inherited assumptions, and the two sizing modes bracket the last two rather than pin them down. Replacing them with figures from real 5–7 inch frames is next on the list.

Code, results and the full log: [`research/codesign-cant`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/codesign-cant) ([live page](https://marisstella.app/research/codesign-cant/)).
