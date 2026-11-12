---
title: "Pricing hover power shrinks the drone, not the rotor cant"
date: 2026-11-12
tags: [codesign-cant, quadrotor, co-design, control-allocation, research]
description: When roll, pitch and yaw share one thrust budget, rotor cant's edge grows to 6.1°. Pricing power cuts it 5x, but the chosen cant stays near 32°.
seo_title: "Quadrotor rotor cant with a real mixer and a price on hover power"
---

This morning's step of the `codesign-cant` programme found that seven earlier drone studies had used a yaw formula that was off by 2 to 2.8 times. Corrected, a fixed rotor cant still cut attitude error by 4.8°, and the optimiser still chose about 35° of cant. Two simplifications were left. The simulator let roll, pitch and yaw each use their full torque at the same moment, which no real mixer can do. Hover power was also free: the search spent it up to a $300 cost cap. We wrote the predictions for both fixes into the log before running anything.

**One thrust budget.** On a canted X quadrotor the thrust patterns for roll, pitch, yaw and lift are orthogonal, so the mixer has an exact form. Our attitude-priority mixer does what PX4 and Betaflight do: it scales roll and pitch down together until every rotor fits in [0, Tmax], then gives yaw whatever is left. Under that mixer:

- Attitude error rises by 2.90° without cant and by 1.63° with cant (5 of 5 seeds each).
- The tuned uncanted vehicle has roll and pitch saturated on 97% of steps, so yaw gets nothing.
- Cant puts yaw on the sideways component of thrust, which the mixer starves less. Its advantage **grows from 4.8° to 6.1°** (SD 0.28, 5 of 5).
- Airmode, which lets the collective thrust move, wins back 1.6° without cant and 0.3° with it.

**A price on power.** We added hover power to the score at 0.1, 0.3 and 1° of error per 100 W. At 0.3° per 100 W the canted design drops from 1.4 kW to about 250 W, and its error rises by less than half a degree. The heavy designs from this morning were not buying accuracy with that power. We expected the cant to fall with the power, to the 5 to 20° the proposal guessed. It did not. With three optimiser starts per seed, the chosen cant stayed between **28° and 37° in 9 of 10 seed and price combinations**, and cant still won the priced score in 5 of 5 seeds at 0.3 and 4 of 5 at 1° per 100 W. This morning's write-up blamed the 35° plateau on the free-power objective. That was wrong: what the free power inflated was the size of the vehicle, not its cant.

One method note. With a single CMA-ES start, 2 of 5 seeds fell to 0 to 13° of cant and scored 4 to 6° worse. The landscape under a real mixer has local optima, so later steps in this programme will use several starts by default.

All of this is simulated. Thrust-to-weight is fixed at 2, the power price is swept rather than measured, and the mass, cost and motor fits are inherited assumptions. The next step replaces those fits with motor catalogue data and frees thrust-to-weight under the new mixer. Code, numbers and the pre-registered predictions are in [`research/codesign-cant`](https://marisstella.app/research/codesign-cant/).
