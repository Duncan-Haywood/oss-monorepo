---
title: "Raising a drone's tilt limit without retuning: cap what the position error may ask for"
date: 2026-11-15
tags: [codesign-cant, quadrotor, PX4, ArduPilot, flight-control, research]
description: Drones tuned at a 20° tilt limit crashed at PX4's 45°. Capping the position loop's proportional request removed every crash for 1–2% of cost.
seo_title: "Flying a quadrotor tuned at 20° tilt at 45°: which fix works"
---

Yesterday's step of the `codesign-cant` programme explained a crash. Quadrotor designs tuned in simulation with a 20° tilt-command limit tipped over at PX4's default limit of 45° (`MPC_TILTMAX_AIR`), even with no gust torque on them. Every crash happened in the first 0.8 s, while the vehicle closed a 0.5 m start offset. The position gain sat at the top of its search range, so that offset asked for a lean of about 27° on each axis. At 20° the limit had always clipped that request. At 45° it went through, and the motors ran out of differential thrust. The advice was to tune at the tilt limit you fly.

A builder with a working tune would rather not retune. So today we tried four changes to the controller and left the gains alone. We wrote nine predictions into the log before the held-out run. The test used 48 tuned designs and 64 held-out flights each, at tilt limits of 20°, 30° and 45°.

- **Cap the proportional request.** Clip the position error that feeds the proportional term to 0.25 or 0.35 m. With a gain of 10 s⁻², 0.35 m is a 3.5 m/s² request, the 20° lean the tune was trained on. The derivative and integral terms, which hold the vehicle against wind, still get the full 45°. At 45° the crashes fell from **34 of 3,072 flights to 0** (1 at 0.35 m). With the start offset doubled to 1.0 m, they fell from **935 to 0**. Where the designs were tuned, at 20°, the 0.35 m cap cost **1–2%** of held-out cost.
- **Ramp the setpoint.** Start the setpoint at the vehicle and move it to the target at 0.5–2 m/s. This also removed every crash, at a cost of 4% (2 m/s) to 18% (0.5 m/s) at 20°.
- **Slow the lean.** A rate limit of 0.5 rad/s on the tilt command crashed flights even at the trained 20° (0 became 15 to 73 per group). At 1 rad/s, the 34 crashes at 45° became 515. Lagging the lean destabilises a stiff position loop. This was the fix we expected to need, and it is the wrong one.
- **Limit tilt magnitude, not each axis.** The simulator clipped roll and pitch separately, which allows about 55° of combined tilt at a 45° limit. PX4 limits the angle of the thrust vector instead. Switching to PX4's version changed nothing at the trained offset (34 to 34). The requests that tipped these designs over were already under 45° in magnitude. At a 1.0 m offset it removed 59% of crashes.

None of the fixes helps much with the other crash mode: a gust torque at twice the designed lever, which the motors cannot match (milestone 7g). Those crashes mostly stayed.

For a builder: if you raise the tilt limit on a tune made at a lower one, first cap what the position error alone may ask for. In a PX4-style cascade, that is the velocity setpoint. Set the cap at the lean the tune saw, or limit setpoint speed. Do not slow the lean. This is a simplified acceleration-form loop, not PX4's actual cascade, and every number here is simulated.

Code, results and the full log: [`research/codesign-cant`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/codesign-cant) ([live page](https://marisstella.app/research/codesign-cant/)).
