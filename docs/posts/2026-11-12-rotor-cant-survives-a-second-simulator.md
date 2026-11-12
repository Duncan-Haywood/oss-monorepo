---
title: "Rotor cant survives a second simulator; our ranking test did not"
date: 2026-11-12
tags: [codesign-cant, quadrotor, RotorPy, sim-to-sim, co-design, research]
description: We flew 60 co-designed quadrotors in RotorPy with canted rotors. Cant still won every seed; our pre-registered top-ten ranking test failed, and could not pass.
seo_title: "Do quadrotor co-design results transfer to RotorPy?"
---

All of today's `codesign-cant` results came from one home-grown simulator. It models the airframe as a rigid body with Euler angles, the motors as a lag on torque, and the wind as a disturbance torque. Before writing a paper on when rotor cant pays, we needed a second, independent simulator. If a result only exists in the simulator you tuned against, it may say more about the simulator than about the drone.

We used [RotorPy](https://arxiv.org/abs/2306.04485) (Folk, Paulos and Kumar, 2023), an open-source multirotor simulator from the University of Pennsylvania. It has quaternion dynamics, motor *speed* dynamics with thrust proportional to speed squared, and rotor aerodynamics: blade drag, induced inflow and translational lift. RotorPy assumes every rotor points straight up. So we subclassed its vehicle and replaced one function, the one that adds up forces and moments, to tilt each thrust axis by the cant angle. At zero cant our version matches RotorPy's own to twelve decimal places. Then we took the 60 designs from the controller study (PID, INDI and geometric control, with and without cant, 10 seeds each) and flew them unchanged on the same held-out attitude task. We used four versions of the wind: the old disturbance torque injected into RotorPy, and RotorPy's own aerodynamics in three variants.

**Cant still wins.** Under RotorPy's aerodynamics, cant cut attitude error in 10 of 10 seeds for every controller: by 4.8 to 5.8° with PID, 4.7 to 5.1° with geometric control and 3.1 to 3.5° with INDI. The six design classes (three controllers, with and without cant) keep their order, with a rank correlation of 0.94 to 1.00. Geometric control with cant comes out best in every simulator.

**Our pre-registered test failed, and it was the wrong test.** The proposal said the result is refuted if the rank correlation of the top ten designs falls below 0.5. It came out at 0.20 to 0.30. But all ten of those designs are canted INDI or geometric designs whose scores span 0.064 on a scale where a degree of error costs a whole point. They are tied. We then asked the original simulator to rank them again on fresh random episodes, and it agreed with itself at only 0.26. RotorPy disagrees with the old simulator no more than the old simulator disagrees with itself. Over all 60 designs the correlation is 0.88 to 0.91, against a self-agreement ceiling of 0.95 to 0.97. That is the honest measure of fidelity. We wrote it up as a refuted prediction and a proposed replacement test, not as a pass.

**The simple simulator is optimistic, most of all for INDI.** Designs lose 1 to 2° of accuracy in RotorPy. Canted INDI designs lose the most (1.8 to 2.1°), geometric ones the least (0.9 to 1.1°). INDI leans on a model of how fast the motors respond, and in RotorPy that model is wrong in shape, not just in size. A practical lesson for anyone tuning INDI in simulation: check it in a simulator with motor-speed dynamics before you trust its margin.

One surprise: injecting the old disturbance torque into RotorPy was much harsher than RotorPy's own aerodynamics. It added 3.4° of error and made 2.8% of episodes diverge, mostly on uncanted designs. In RotorPy the drone drifts with the wind, so the airspeed and the drag fall. A torque injected from the wind speed does not fall with them.

Caveats: the designs were not retuned in RotorPy, the rotor-drag coefficients are scaled from RotorPy's Hummingbird model rather than measured (doubling them moves the error by under 0.25°), and everything is still simulation. Code, results and the predictions written before the run are in [`research/codesign-cant`](https://marisstella.app/research/codesign-cant/).
