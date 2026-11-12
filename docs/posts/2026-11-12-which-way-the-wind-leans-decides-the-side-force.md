---
title: "A canted rotor's side force: harmless or a 21% position penalty, depending on one sign"
date: 2026-11-12
tags: [codesign-cant, quadrotor, co-design, position-hold, research]
description: "In simulation, rotor cant cuts quadrotor yaw error 4.7° in position hold. Whether its side force costs position depends on the centre of pressure."
seo_title: "Rotor cant and position hold: when does the side force cost accuracy?"
---

Tilting a quadrotor's rotors about their arms (*cant*) buys yaw torque that no controller can make. Earlier steps of the [`codesign-cant`](https://marisstella.app/research/codesign-cant/) programme found it cuts attitude error by about 5° under PID, INDI and geometric control. There is a known price. When the mixer moves thrust between rotors to roll or pitch, the tilted thrusts stop cancelling sideways, and the body gets a horizontal push. Today's run asked whether that push costs position hold more than the yaw gain is worth.

First we derived the force from the full four-rotor wrench map instead of reusing an older formula. Per unit of roll torque, the body gets sin α / (L cos α − κ sin α) newtons sideways, and yaw torque gives none. That is √2 smaller than the October study used. The simulator now runs 6-second hold episodes. The drone starts half a metre off, yaw steps ±30° every 1.5 s, and at 3 s the mean wind jumps by 3 m/s. We co-designed arm, propeller, cant and nine controller gains with CMA-ES over 6 seeds, then held out 64 gusty episodes.

What came out (simulated; all numbers in `experiments/m6_poshold/results.txt`):

- **Cant still buys yaw.** Yaw error falls from 14.9° to 10.2°, 6 of 6 seeds. Position is no better: +0.03 m, with one outlier seed carrying it. The co-designed cant stays at 36 to 38°.
- **The side force did not cost position. It helped**, at 0.96× position error with it on against off, and 0.71× after the wind step. We had predicted a cost of up to 20%.

That surprise had a mechanical explanation. In the simulator the gust that pushes the drone sideways also twists it, because the centre of pressure is offset from the centre of mass. The attitude loop holds a steady counter-torque, and with canted rotors that counter-torque makes a side force. In the model as written, the force points against the wind. So cant was cancelling part of the wind push for free, because of a sign nobody had chosen on purpose.

So we flipped the sign and re-scored the same designs. Now the counter-torque's side force adds to the wind. Position error rises to **1.21×** with the force on (all six seeds between 1.18× and 1.24×), and to 1.62× after the wind step. That is past the 20% line the proposal set for refuting its hypothesis. Cant still wins the overall score in 6 of 6 seeds, because 4.7° of yaw is worth more than the position it gives up.

The finding is narrower than "the side force is fine" or "the side force hurts". Whether it costs anything depends on where the centre of pressure sits relative to the centre of mass. A frame designer controls that by where the battery and payload go. We have not yet worked out which physical placement gives which sign, and we did not retrain for the flipped case. Both are next. The drag, noise and altitude model are inherited assumptions, and nothing here has flown. Of seven predictions written before the run, five held. Two were refuted: ignoring the force in design hurt in only 2 of 6 seeds, and the wind step barely moved the canted vehicles.

Code, tests, results and the pre-registered predictions are in [`research/codesign-cant`](https://marisstella.app/research/codesign-cant/).
