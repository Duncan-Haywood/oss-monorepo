---
title: "The drone crashed at a tilt limit it was never tuned at"
date: 2026-11-14
tags: [codesign-cant, quadrotor, PX4, tilt-limit, controller-tuning, sim-to-real, pre-registration]
seo_title: "Why a tuned quadrotor tips over at PX4's 45° tilt limit"
description: "Retrained quadrotors crashed with no gust torque at a 45° tilt limit. Every crash came in the first 0.8 s, recovering from the start offset."
---

Two earlier steps of the `codesign-cant` programme left one result unexplained. All of it is simulated. We retrained co-designed quadrotors (frame, propellers, rotor cant and controller gains together) and then flew them on 64 held-out flights each. With PX4's default tilt-command limit of 45°, some of the retrained designs crashed even when the wind exerted no torque on the airframe at all. That happens when the centre of pressure sits on the centre of mass, which we call lever 0. Across 18 retrained designs that was 24 crashes in 1,152 flights. The designs they were compared with, trained the same way a step earlier, crashed on none. Every one of them passes the linear stability test from milestone 7c.

This step re-flew the same 48 designs without retraining. It changed one thing at a time: an ideal mixer, softer position gains, no side force from the canted rotors, no integrator feed-forward, motors 10% faster, and a looser bound for what counts as a crash. We wrote ten predictions down before the run.

**It was never the wind.** All 24 crashes were real tip-overs past 60°. Moving the crash bound to 85° saved only one. All 24 came before the wind changes at 3 s, between 0.16 and 0.79 s (median 0.39 s). We had predicted they would come after the wind step, and that was wrong. Each flight starts up to 0.5 m from the point it has to hold. When we shrank that offset to 0.25 m, no design crashed in either geometry.

**The tilt limit was hiding it.** In every design the position gain sits at the top of its search range (10 s⁻²). So a 0.5 m offset asks for about 5 m/s² of acceleration, a lean near 27° on each axis. All training ran with a 20° tilt limit, which clipped that request. At 45° it goes through. In the flights that crashed, the mixer had to scale back roll and pitch on 74 to 84% of steps, against 0% in the flights that survived. The crashes also landed on slow-motor plants: a lag multiplier of 1.91 against a median of 1.59. The retrained designs carry stiffer attitude loops than the older ones (proportional gain 2.33 to 2.41 against 2.13), and that put them nearer the edge.

**Almost any slack fixes it.** An ideal mixer or halved position gains removed all 24 crashes. Switching off the side force left 1 and switching off the feed-forward left 2. Motors 10% faster, the guess from milestone 7h, left 8, so it explains part of the effect but not all of it.

**What it means for a builder.** Tune at the tilt limit you will fly, or fly at the limit you tuned at. The co-design did nothing wrong at 20°. It never saw the large-lean regime, so it had no reason to stay out of it. In this simulator ArduPilot's 30° default left 1 crash in 1,152 flights. If you raise a tuned airframe's tilt limit, try the step response from a standing offset before trusting it in wind.

**Limits.** We worked out the mechanism from these probes and from a sweep of the start offset that we added after reading the results. The gain correlations are across 24 designs that are not independent draws. The position-gain range is inherited from earlier work and assumed. Everything ran in one simulator with assumed plant ranges and 64 held-out flights per design. Of the ten predictions, eight held and two were refuted. Next comes training at 45° (or across 20 to 45°), and limiting the outer loop's lean rate as a fix on the controller side.

The plan, predictions and every number are in the programme's [log](../../research/codesign-cant/LOG.md) and [README](../../research/codesign-cant/README.md).
