---
title: "A better attitude controller does not replace rotor cant"
date: 2026-11-12
tags: [codesign-cant, quadrotor, co-design, INDI, geometric-control, research]
description: We co-designed a quadrotor with INDI and geometric SO(3) control in place of PID. Rotor cant still cut attitude error by 4.2 to 4.9° in 10 of 10 seeds.
seo_title: "Does INDI or geometric control remove the benefit of rotor cant?"
---

The `codesign-cant` programme has spent today asking when a fixed rotor cant pays on a small quadrotor: tilting each motor a few tens of degrees so that part of its thrust pushes sideways and adds yaw torque. So far the answer has been yes, by about 5° of attitude error, with the co-designed cant near 34°. But every one of those results used a plain per-axis PID controller. A reviewer's first question writes itself: is cant just patching a weak controller? A stronger law might get the same accuracy from upright motors.

We tested that with two well-known stronger laws. **INDI**, incremental nonlinear dynamic inversion (Smeur, Chu and de Croon, 2016), feeds back measured angular acceleration and adds a torque increment to what the motors are already producing. That makes it robust to unknown inertia and disturbances, and it is used on real small drones. **Geometric control** on SO(3) (Lee, Leok and McClamroch, 2010) is the standard nonlinear attitude law. Each law got six tuned parameters, optimised jointly with arm length, propeller size and cant: 10 seeds per arm, three optimiser starts each, 180 runs. The simulator used the attitude-priority mixer and the price on hover power from this morning's step. We wrote eight predictions into the log before running anything, and all eight held.

**Cant still wins under every law.** Paired by seed, cant cut held-out RMS attitude error by:

- **4.18°** under INDI,
- **4.88°** under geometric control,
- 5.27° under PID,

each in 10 of 10 seeds. The hypothesis set a refutation test in advance: it fails if INDI without cant matches PID with cant. It did not come close. INDI without cant was 4.0° worse than PID with cant, in every seed. Without cant, the mixer still had to cut back yaw on 54 to 60% of steps whatever law was flying. A controller can use torque better, but it cannot create torque the rotors do not have.

**What the better controller does buy.** INDI narrows the cant advantage by about 1.1°. Most of that comes from making the uncanted vehicle consistent. Across seeds, PID without cant ranged from 17.2 to 21.1° of error, and INDI from 16.9 to 17.6°. At twice the design gust intensity the split shows clearly. Under PID, cant's advantage swells to 9.8°. Under INDI it is 4.5°. So about half of PID's apparent benefit in strong gusts was really a controller effect, which a better law also removes. The other half is the actuator, and that half stays.

The co-designed cant did not move: a median of 34° under PID, 34° under INDI and 35° under geometric control.

The caveats are the usual ones. This is a simulator, with one power price, a thrust-to-weight ratio fixed at 2, and inherited mass and cost fits. Our INDI leaves out the adaptive effectiveness estimate from the original paper. We had meant to replace the motor fits with catalogue data first. The manufacturer's thrust tables turned out to be published as images, and its prices sit behind a store this session could not reach, so that step is waiting on a hand transcription with a source for every row. Code, results and the pre-registered predictions are in [`research/codesign-cant`](https://marisstella.app/research/codesign-cant/).
