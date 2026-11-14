---
title: "The drone crashed with no gust at all"
date: 2026-11-14
tags: [codesign-cant, quadrotor, co-design, tilt-limit, px4, ardupilot, mixer-saturation, pre-registration]
seo_title: "Quadrotor tilt limit: why tuned gains crash at PX4's 45°"
description: "Retrained quadrotor designs crashed at a 45° tilt limit with no gust torque. The cause was a position gain at its search bound, not thrust-to-weight."
---

The `codesign-cant` programme designs small quadrotors in simulation: frame, propellers, rotor cant and controller gains, all chosen together. The last two steps left one result we couldn't explain. Some of the retrained designs crashed at PX4's default 45° tilt limit when the gust lever was zero, so no gust torque was acting at all. The earlier designs never did. Our only guess so far had been the bigger propellers' slower motors.

This step trained nothing. It re-flew the same 48 designs on the same 64 held-out flights, once at each tilt limit from 30° to 45°, and then made one change at a time. We wrote ten predictions down and committed them before running it. The whole run took 47 seconds.

**When it happens.** All 24 crashes (of 1,152 flights across the three retrained sets) are tilt-overs in the first 0.8 seconds. That is while the vehicle pulls itself back from its random starting offset of up to half a metre. On those flights the mixer is scaling back the roll and pitch requests on three quarters of the steps, against 0.3% on flights that survive. They are also the plants with the slowest motors. The crashes come from just 7 of the 64 episodes.

**What it isn't.** We re-sized the same airframes and gains to thrust-to-weight 2. That removed none of the 21 crashes of the two sets that had chosen more. Raising the "counts as crashed" angle from 60° to 85° removed one. These flights really do go over.

**What removes it.** An ideal mixer, or halving the position-loop gains, removes all 24. Switching off the rotor-cant side force leaves 1, and switching off the integrator feed-forward leaves 2. Motors 10% faster leave 8. With this many single fixes, the safety margin is thin rather than missing.

**Why these designs.** We found this after reading the results. In all 48 designs the position gain sits at the top of its search range (10 s⁻², a range we inherited, not measured). The tuner trained at a 20° tilt limit. There the limit clips the tilt command, so a stiff position loop is safe and the tuner pushes it as far as it can go. At 45° nothing clips. A half-metre offset asks for about 25° of tilt from the proportional term alone, and that is more roll and pitch torque than slow motors can deliver inside the hover limits. The retrained sets also chose stiffer attitude gains than the originals. Summed over the three sets: 1 crash at ArduPilot's 30° default, 11 at 35°, 23 at 40° and 24 at 45°.

**For a builder.** Gains tuned under one tilt limit are not automatically safe under a looser one. Fly them at the limit they were trained at, or train at the limit you'll actually fly. If an optimiser's gain sits at the edge of its search range, ask what is holding it there.

**Limits.** It's a small sample: 24 crashes across 7 episodes, and every fix acts on the same few flights. We only spotted the position-gain bound after seeing the results. It's one simulator with perfect altitude hold, and everything here is simulated. Eight predictions held and two were refuted: thrust-to-weight as the cause, and a sharp onset above 40°.

The plan, predictions and numbers are in the programme's [log](../../research/codesign-cant/LOG.md) and [README](../../research/codesign-cant/README.md).
