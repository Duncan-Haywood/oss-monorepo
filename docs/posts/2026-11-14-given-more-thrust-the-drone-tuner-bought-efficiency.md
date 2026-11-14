---
title: "Given more thrust, the drone tuner bought efficiency"
date: 2026-11-14
tags: [codesign-cant, quadrotor, thrust-to-weight, co-design, mass-spiral, robustness, pre-registration]
seo_title: "Does more thrust-to-weight make a quadrotor gust-robust? Not alone"
description: "Bigger motors stopped a co-designed quadrotor's gust crashes but doubled its hover power. A tuner given thrust-to-weight as a free variable used the headroom for efficiency, so the crashes stayed."
---

The last step of the `codesign-cant` programme ended with simple advice. The quadrotors it studies crash when the gust's lever on the airframe doubles. They tip over because the motors run out of differential thrust. So buy more thrust: a thrust-to-weight ratio above the 2:1 every design so far assumed.

This step checked that advice two ways. All of it is simulated.

**Bolting on bigger motors.** We took the twelve designs from milestone 7e, kept their airframes and controller gains, and re-sized them with stronger motors. The first try, at thrust-to-weight 2.5 and 3.0, did not produce a vehicle at all: the sizing loop ran away to its 20 kg clamp. Each design has to fly for 15 minutes. Heavier motors need a bigger battery, the bigger battery needs more thrust, and the mass spirals. These airframes are sized right at that edge: they close only up to 2.10 to 2.15 (centre of pressure above the centre of mass) and 2.25 to 2.50 (below). We changed the plan to "the largest that still closes" before running anything on the held-out flights.

At that edge the advice works. Crashes at twice the trained lever fell from 4 and 12 (at 20° and 45° tilt limits) to zero, and from 45 and 55 to 0 and 2. The cost is the price of the spiral. Mass rises 78%, from 1.61 to 2.86 kg, and hover power from 486 W to 1157 W. That is no longer the same vehicle.

**Letting the tuner choose.** Then we repeated milestone 7e's training with thrust-to-weight as a free design variable between 1.5 and 4, alongside arm length, propeller size, cant angle and nine controller gains. We predicted the tuner would pick less than 2, because it pays for hover power and trains only at the normal lever. That was wrong: all 12 seeds picked 2.05 to 2.55.

They spent it on efficiency, not authority. The retrained designs chose slightly larger propellers and hover on the same or less power (460 W against 486 W). Their roll and pitch torque limit barely moved (0.995 against 0.981 N m). So the doubled-lever crashes stayed: 9 against 4 with the centre of pressure above, 38 against 45 below. With a 45° tilt limit, PX4's default, the retrained "above" designs also crashed at the normal lever (9 of 384 flights, where milestone 7e's designs crashed on none). All of them pass the linear stability test we built in milestone 7c, and we don't yet know why.

**What it means for a builder.** Thrust headroom does remove this kind of crash. But on an airframe sized to its endurance target, a little more thrust-to-weight can cost a lot of mass, so check the sizing before ordering bigger motors. And headroom in the design space does not make the tuner robust. Asked only to fly well at the design lever, it treats the extra thrust as an efficiency budget. If the centre of pressure is uncertain (a payload, a gimbal, a sensor pod), the tuning objective has to include that range. That is the next step: train across lever 0 to 2 with thrust-to-weight free.

**Limits.** The motor-mass and sizing fits are inherited assumptions, and where the mass spiral starts depends on them. The retrofit keeps the 15-minute endurance target; a builder could accept shorter flights instead. One simulator with assumed gust and plant ranges, six seeds, 64 held-out flights per design. Of the seven predictions written down before the run, three held, two held only in part and two were refuted.

The plan, predictions and every number are in the programme's [log](../../research/codesign-cant/LOG.md) and [README](../../research/codesign-cant/README.md).
