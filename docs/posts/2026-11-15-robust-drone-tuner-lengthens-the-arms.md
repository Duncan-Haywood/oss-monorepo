---
title: "Asked for robustness, a drone co-design kept the stiff gain and lengthened its arms"
date: 2026-11-15
tags: [codesign-cant, quadrotor, PX4, flight-control, co-design, research]
description: Given a wide gain box and an objective covering an uncertain centre of pressure, a co-designed quadrotor kept a high gain and some mass, and grew longer arms.
seo_title: "Quadrotor co-design: what a robust objective does with a high gain"
---

The step before this one in the `codesign-cant` programme ended on a trade. We capped the position loop's proportional request at 3.5 m/s² and widened the position gain's search box from 10 to 31.6 s⁻². The optimiser then tripled the gain and turned it into a lighter, lower-power quadrotor. That design crashed more often whenever the centre of pressure sat further from the centre of mass than in training. Its objective scored a single nominal lever, so nothing in it asked for robustness. An earlier step had tried an objective that scores three levers (0, 1 and 2). That objective made the optimiser buy mass, which on our sizing model is torque against a gust. The two pull in opposite directions, so this step put them together.

We ran two arms, each with six seeds and two CMA-ES starts in both centre-of-pressure geometries. Both trained at PX4's 45° tilt limit with the cap and the three-lever objective. One kept the old 10 s⁻² box and one had the wide box. We wrote seven predictions into the log before the full run and scored every design on the same 64 held-out flights in 26 conditions. The first launch hit the session's two-hour limit after 32 of 48 training runs. Those runs were cached, so the second launch picked up from there.

- **The robust objective does not undo the stiffness.** With the wide box the optimiser chose position gains of 20–31 s⁻² (means 23.8 and 24.3, against 27.5 and 27.2 for the one-lever designs). With the old box every seed sat at the 10 s⁻² edge again.
- **It keeps part of the mass and lengthens the arms.** The new designs weigh 1.40–1.45 kg. That is heavier than the one-lever wide designs (1.10–1.29 kg) but lighter than the robust designs in the old box (1.53–1.60 kg). Their frame arms are the longest of any set (0.106–0.110 m against 0.094–0.103). With thrust-to-weight fixed, a longer arm is the one way on this model to get more roll and pitch torque per newton of weight without adding mass. These designs have the most torque per weight of any set.
- **They track best where they were trained.** At the trained levers with the cap, their held-out cost beats the reference designs by 0.030 and 0.044 (5 of 6 and 6 of 6 seeds). No other set beats them by more than 0.013.
- **Robustness lands in between.** At twice the lever and a 45° limit, with the cap, they crash on 53 and 52 of 384 flights, against 73 and 105 for the one-lever wide designs and 19 and 26 for the robust designs in the old box.
- **The cap is still safety-critical.** Without it, 231–250 of 384 flights crash at 45°.

Five of the seven predictions held. We had guessed that the robust objective would win outright and keep the mass. It did not in one geometry, where the new designs came out lighter than the reference designs. We also guessed the extra gain would cost nothing at the second trained lever, and in one geometry it cost 32 crashes against 20.

The arm-length reading comes from the designs the optimiser chose, not from a run with the arm held fixed. That control run is the next step. As in the earlier three-lever step, one seed in every robust arm lands on a heavy design of about 2 kg that almost never crashes with the cap. That seed sets much of each arm's average. Everything here is simulated, with inherited motor-mass and sizing fits and a simplified acceleration-form position loop rather than PX4's cascade.

For a builder: an objective that covers your centre-of-pressure uncertainty will still use a higher position gain if you allow one. It pays for the gain partly in arm length rather than only by shedding mass. The cap on the proportional request stays part of the airframe's safety case either way.

Code, results and the full log: [`research/codesign-cant`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/codesign-cant) ([live page](https://marisstella.app/research/codesign-cant/)).
