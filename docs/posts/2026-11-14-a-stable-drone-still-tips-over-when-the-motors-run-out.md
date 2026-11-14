---
title: "A stable drone still tips over when the motors run out"
date: 2026-11-14
tags: [codesign-cant, quadrotor, rotor-cant, stability, actuator-saturation, mixer, thrust-to-weight, pre-registration]
seo_title: "Why does a stable quadrotor still crash in gusts? Thrust headroom"
description: "Quadrotors with a stability margin crashed in a doubled gust lever, tipping over with the mixer saturated. More authority fixed it; airmode, retuning did not."
---

The `codesign-cant` programme studies small quadrotors with canted rotors, where the airframe, the motors and the controller are tuned together. The last two steps added a stability margin to the tuner: keep the attitude integral gain at or below 0.8 times its linear stability ceiling. That margin cost under 1% of performance and removed every crash that a looser tilt limit exposed.

One set of crashes would not go away. When the gust's lever on the airframe was doubled, beyond anything the tuner trained on, 4 of 384 held-out flights still crashed at a 20° tilt limit and 12 to 13 at 45°. That held at every margin from 0.8x down to 0.6x. A tighter margin did nothing, so the cause had to be something else.

**What we tested.** No retraining. We took the designs already tuned in earlier steps and flew them again on the same 64 held-out flights, changing one thing at a time:

- the angle that counts as a crash (60° raised to 85°)
- the attitude-priority mixer (as in PX4 and Betaflight) replaced by an ideal one that delivers whatever torque is asked for
- the ideal mixer plus 1.25x, 1.5x or 2x torque
- the position-loop gains halved
- an airmode mixer, which may shift the collective thrust

We wrote eight predictions down before running. All of this is simulated.

**What happened.**

- **Every crash is a tip-over.** All 209 crashes across the three design sets roll or pitch past 60°. None drifts away first.
- **The mixer is saturated when they start.** In flights that crashed, the mixer was cutting back the roll and pitch torque on 6 to 51% of steps. In flights that survived, almost never. In the crashing flights the gust torque reached 0.87 to 1.13 of the motors' torque limit, against 0.50 in the survivors.
- **More authority fixes it.** The ideal mixer cut the crashes of the margin-constrained designs from 12 to 4 at the 20° limit, and from 37 to 8 at 45°. With 1.25x torque on top, both went to zero. Designs with the centre of pressure below the centre of mass needed 1.5x.
- **Nothing else does.** Raising the crash angle to 85°: 12 to 8 and 37 to 29. Halving the position gains: 12 to 10, though 37 to 12 at the looser limit. Airmode: 12 to 19 and 37 to 40, slightly worse. At hover the collective thrust already sits mid-range, so shifting it buys nothing.

Our prediction that authority was not the cause was wrong. A short smoke run on a calm seed had shown the gust peaking at 0.4 of the limit, and we read too much into it. On the held-out flights, the gust exceeded the limit at some point in about half of the crashes.

**What it means for a builder.** A stability margin keeps a tuned loop away from the edge of the plant set, but it cannot create thrust the motors don't have. If your frame's centre of pressure might sit twice as far from the centre of mass as you designed for (a sensor pod, a payload, a camera gimbal), no gain change or airmode fixes the gust case. Buy thrust-to-weight above the 2:1 these designs assumed. For the programme, the next question is the one milestone 3 left open: let motor headroom be a design variable and see what cant angle and thrust-to-weight the tuner picks when the gust lever is uncertain.

**Limits.** The torque-room and ideal-mixer runs are probes, not redesigns: bigger motors would also add mass and hover power, and the ideal mixer cannot be built. One simulator, with assumed gust and plant ranges. Six seeds, 64 held-out flights per design. The airmode and torque-sweep checks were added after we saw the first results.

The plan, the predictions and every number are in the programme's [log](../../research/codesign-cant/LOG.md) and [README](../../research/codesign-cant/README.md).
