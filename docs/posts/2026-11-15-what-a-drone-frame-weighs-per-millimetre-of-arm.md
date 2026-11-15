---
title: "What a drone frame weighs per millimetre of arm, and why it changed our arm-length result"
date: 2026-11-15
tags: [codesign-cant, quadrotor, co-design, frame-design, research]
description: "36 listed FPV frames put a longer quadrotor arm at 0.26 g per mm of wheelbase. At that figure, longer arms buy less gust robustness than we reported."
seo_title: "Quadrotor frame weight per mm of arm, from 36 listed frames"
---

The last step of the `codesign-cant` programme swept the arm length of 48 fixed quadrotor designs. It found that longer arms keep cutting crashes in a gusty, uncertain centre-of-pressure condition until the design stops being valid. One input behind that sweep was never measured: how much heavier the frame gets as the arm grows. The sizing model carried an inherited guess, 0.05 + 0.8 L kg, with L the centre-to-rotor arm. This step replaced the guess with listed figures and ran the sweep again.

**The data.** A UK retailer's frame categories list wheelbase and weight for most open-propeller frames, from 3 to 10 inches. We took 39 listings, kept the verbatim spec line and URL for each, and fitted 36. Three were excluded, each with a recorded reason: one repeats the 5-inch wheelbase on a 6-inch page, one labels a 7-inch weight as "5 inch", and one is a duplicate.

- **Stretching one design is cheap.** GEPRC's Mark4 comes in 5, 6 and 7 inch sizes with the same 5 mm arm plate: 102, 111 and 121 g at 225, 260 and 295 mm. Foxeer's Aura V2 Pro goes from 119 g at 235 mm to 124 g at 265 mm. Pooled, that is 0.26 g per mm of wheelbase, or 0.51 kg per metre of arm: 64% of the guess.
- **A frame built for a bigger size is not.** Across 30 frames from 162 to 342 mm, from seven brands, weight rises about as the wheelbase squared, a slope of 2.27 kg per metre of arm at these sizes. Bigger frames get thicker arms and bigger plates, not just longer ones. The scatter is wide (47 g residual SD).

The guess sits between the two. For the question "what happens if I lengthen this frame's arms", the stretched-design slope is the honest one.

**What changed when we used it.** We re-ran the sweep on the same 48 designs under four frame laws: the old one, the stretched-design slope, the cross-brand slope, and the cross-brand law itself. We wrote seven predictions into the log first.

- **The arm buys less robustness.** At twice the trained centre-of-pressure lever, the lever-1 designs with the centre of pressure below crash on 66 of 384 flights at 135 mm, against 44 under the old law. Crashes still fall steadily as the arm grows.
- **The arm can go further before the design breaks.** The old law's mass-battery spiral ended the useful range at 130 mm (centre of pressure above). With the stretched-design slope, all six designs stay valid to 150 mm. With the cross-brand slope they stop at 110 mm.
- **Part of what we called the arm was mass.** At the same arm, the old law's heavier vehicles crashed less than the stretched-slope ones at 253 of 350 design-points and more at 5. In a fit that holds each design fixed, both terms count: in seven of eight design sets, about 0.14 to 0.18 fewer crashes per 64 flights per millimetre of arm, and 0.15 to 0.89 fewer per 100 g of mass.
- **The sizing model magnifies frame mass.** Under the cross-brand law the frames are 20 to 43 g lighter at the tuned arm. The sized vehicles come out 0.18 to 0.64 kg lighter, because a lighter frame needs less battery for the same endurance, which needs smaller motors, and so on. On the same tunes, those lighter vehicles crash on 151 to 160 flights instead of 73 to 105.

Four of the seven predictions held. We expected the stretched-design law to change crash counts by five flights at most at a given arm; it changed them by up to 27. We also expected the cross-brand slope to stop the arm short of the lever-aware designs' robustness, but it reached it before the design broke.

The last finding matters most for the programme. Any result that depends on vehicle mass inherits the sizing closure's 6 to 15 times amplification. So the next step is to check that closure, meaning battery specific energy, the motor-mass fit and all-up weight, against built 5 to 7 inch quadrotors.

For a builder: stretching a frame's arms costs about a quarter of a gram per millimetre of wheelbase in carbon. On a fixed tune a longer arm still helps in gusts, but less than our last post said, because our model added more mass with the arm than a real stretched frame does. Everything here is simulated, with weights as one retailer lists them and designs that were not retuned.

Code, data and the full log: [`research/codesign-cant`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/codesign-cant) ([live page](https://marisstella.app/research/codesign-cant/)).
