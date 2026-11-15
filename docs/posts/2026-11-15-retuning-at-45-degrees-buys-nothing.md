---
title: "Retuning a drone at a 45° tilt limit bought nothing; a wider gain box bought a lighter, fragile one"
date: 2026-11-15
tags: [codesign-cant, quadrotor, PX4, flight-control, co-design, research]
description: Retrained at 45° tilt limit, co-designed quadrotors matched their 20° tune. Given a wider gain box, the optimiser built a lighter drone that needs its cap.
seo_title: "Should you retune a quadrotor for a 45° tilt limit? Simulated test"
---

Earlier today's step of the `codesign-cant` programme found a way to raise a quadrotor's tilt limit from 20° to PX4's default 45° (`MPC_TILTMAX_AIR`) without retuning. The fix caps what the position error alone may ask of the vehicle at 3.5 m/s², about the lean the tune saw at 20°. The step before that had given the obvious alternative advice: retune at the limit you fly. So we tested that advice too. We co-designed the airframe and its controller again with the 45° limit in the training loop and compared the results with the 20° designs.

We ran three arms, each with six seeds and two CMA-ES starts in both centre-of-pressure geometries, and wrote nine predictions into the log before the full run. One arm trained at 45° and nothing else. One trained at 45° with the cap in the loop. The third added the cap and widened the position gain's search box from 10 to 31.6 s⁻², because every design so far had pressed against the 10 s⁻² edge.

- **Retuning at 45° bought nothing.** The designs trained at 45° came out with the same gains and the same held-out cost as the 20° designs. When the vehicle had to close a 1.0 m start offset, twice the trained one, they crashed just as often (92–103 of 384 flights against 97–118). Adding the cap to the old 20° tune removed every one of those crashes.
- **The optimiser never lowered the position gain.** With or without the cap, it kept the gain at 10 s⁻². We had predicted it would back off without the cap. It did not.
- **Given room, it tripled the gain and spent the gain on mass.** With the cap and the wider box, the optimiser chose gains of 22–31 s⁻², some of them near the new edge. It also built a 19% lighter airframe with 30% less hover power in one geometry (11% lighter and 18% less power in the other). Those designs held position as well as the old ones where they were trained.
- **The lighter design depends on the cap.** Without the cap at 45°, it crashes on 70% of flights. With the cap in place, it still crashes 2–6 times as often as the old designs when the centre of pressure sits twice as far from the centre of mass as designed (73 and 105 of 384 against 12 and 52).

The last two results are the familiar trade of an objective that never asks for robustness. The objective prices hover power and is scored at one nominal lever, so a stiffer loop gets turned into a smaller vehicle, and a smaller vehicle has less torque to answer a gust that pushes off-centre.

For a builder, the advice is short. If your tune was made at a lower tilt limit, add the cap rather than retune. If you then raise the position gain under the cap, treat the cap as part of the airframe's safety case, and test at the centre-of-pressure uncertainty you actually expect. Four of the nine predictions were refuted. Everything here is simulated, in a simplified acceleration-form position loop rather than PX4's actual cascade.

Code, results and the full log: [`research/codesign-cant`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/codesign-cant) ([live page](https://marisstella.app/research/codesign-cant/)).
