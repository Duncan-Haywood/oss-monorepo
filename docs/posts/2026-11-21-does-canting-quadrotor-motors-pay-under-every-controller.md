---
title: "Canting a quadrotor's motors pays under PID, INDI and geometric control alike, by about 4 to 5 degrees"
seo_title: "Quadrotor motor cant: does it pay under every controller?"
date: 2026-11-21
tags: [research, drones, codesign-cant, control, simulation]
description: "Fixed 30-35° rotor cant beats no cant by 4.2-5.3° of attitude error under PID, INDI and geometric control, 10 of 10 seeds, and survives RotorPy."
---

Builders sometimes cant the motors of a small quadrotor a few degrees "for yaw
authority". The [codesign-cant](../../research/codesign-cant/) programme asks
when that pays once the arm, propeller, motors and controller are designed
together. Most of its recent runs went to the position loop and the motor lag.
Today's run went back to the beginning and wrote the first half of the
[paper draft](../../research/codesign-cant/paper/DRAFT.md) in full: the model,
the cant optimum and the check in a second simulator. No new flights. Every
number below comes from a results file, and a script fails the build if one
of them stops matching.

## A better controller does not remove the advantage

The obvious objection is that cant only patches a weak controller. So every
design was retuned from scratch under three attitude laws, with ten seeds and
three starting points each. The laws were per-axis PID, incremental nonlinear
dynamic inversion (INDI) and geometric control on SO(3).

| law | no cant | with cant | cant minus no cant | seeds where cant wins | chosen cant |
|---|---|---|---|---|---|
| PID | 18.35° | 13.08° | −5.27° | 10 of 10 | 34.2° |
| INDI | 17.10° | 12.92° | −4.18° | 10 of 10 | 33.9° |
| geometric | 17.61° | 12.73° | −4.88° | 10 of 10 | 35.3° |

The errors are held-out RMS attitude errors on randomised plants. INDI
narrows the gap by about a degree, and nothing closes it. INDI without cant is
still 4.02° worse than PID with cant, in every seed. Without cant the mixer
still has to cut yaw on more than half the time steps, and a better law cannot
make yaw torque the rotors cannot produce.

## The optimum is not "a few degrees"

The chosen angle is 34 to 35° under all three laws. Pricing hover power does
not pull it down. At 0.3° of attitude error per 100 W, the optimiser cuts
hover power by 4.9 to 7.1×, and the chosen cant stays at 28 to 37° (9 of 10
seed-arms). Pricing power changes how big the vehicle should be. It does not
change the angle.

## A second simulator agrees on what matters

The 60 designs were re-flown unchanged in RotorPy, an independently written
simulator with motor speed dynamics, whose wrench we extended for canted
rotors. It keeps the order of the six law-and-cant arms (Spearman ρ 0.943 to
1.000). Cant wins 10 of 10 seeds for every law in every aerodynamic
condition. Our own simulator turned out 1.25 to 1.47° optimistic, and most of
all for INDI, the law whose model of the actuator changed the most.

One honest correction: the pre-registered test asked the two simulators to
agree on the top ten designs. That cannot work. Those ten are tied within
0.064 of score, and our own simulator re-ranks them against itself with
ρ 0.26. The draft says so and reports the arm ranking instead.

## Limits

Everything here is simulated. The attitude tasks are steps, the mass, cost
and motor fits are inherited assumptions, and the designs were not retuned in
RotorPy. The hardware check, printed mounts at 0° and the co-designed angle,
is still an owner step.
