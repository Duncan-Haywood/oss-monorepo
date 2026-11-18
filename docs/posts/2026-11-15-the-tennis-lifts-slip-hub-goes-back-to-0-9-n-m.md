---
title: "The tennis lift's slip hub goes back to 0.9 N m, and 0.8 is one step too far"
seo_title: "Setting a friction slip clutch: jam force against start slip"
date: 2026-11-15
tags: [open-tennis-robots, hardware, mechanical, simulation]
description: "Three full jam sweeps on the tennis feeder's lift: 0.9 N m cuts the flight's worst hit from 91 to 84 N, and 0.8 starts slipping on soft starts."
---

The open tennis-ball feeder lifts balls to its hopper on a cleated belt. A
[friction slip hub](2026-11-15-a-slip-hub-takes-the-tennis-lifts-jam-off-the-flight.md)
sits between the gearmotor and the belt's drive pulley. When a ball jams,
the rotor keeps turning and the belt stops, so the flight that hit the ball
takes the hub's slip torque instead of the whole rotor's momentum.

The hub was first set to 0.9 N m. Later the same day the lift's duty started
following the battery, and the hub went up to 1.0 N m. The reason was the
current sense. The shunt sat in the MOSFET's source, so it only saw current
while the MOSFET was on. Its trip, counted in motor amps, rose as the duty
fell. A 0.9 N m hub sliding at the low end of its tolerance would then have
drawn too little current to trip the cutoff, and a jam could have slid on
with nothing cut.

[The next change](2026-11-15-the-tennis-lifts-current-sense-moves-inside-the-diode-loop.md)
moved the shunt inside the motor's diode loop, high side. That makes the trip
the same at every duty. So the reason for 1.0 N m was gone, and the open item
was to go back down and rerun everything.

**What was run.** The lift's whole jam sweep, three times: at 1.0, 0.9 and
0.8 N m, with nothing else changed. The sweep runs the real firmware against
a simulated plant. It covers both battery corners, rotor inertia from half to
twice the assumed figure, the hub and the trip at both ends of their
tolerances, the jaw coupling's stiffness and play, and the belt as a lumped
mass and as a chain. Every motor, belt and ball figure is still an
assumption. Nothing has been built.

| hub setting | 1.0 N m | 0.9 N m | 0.8 N m |
|---|---|---|---|
| worst peak on a flight (plate allows 156 N) | 91 N | 84 N | 78 N |
| hood jam's net pull at the drive pulley | 100 N | 90 N | not run |
| slowest cut | 109 ms | 129 ms | 169 ms |
| current while sliding at the lowest / highest trip | 1.42x | 1.30x | 1.17x |
| soft starts that slip the hub (worst coupling) | 0 | 0 | 3 of 6 |
| switched starts that slip it (empty belt) | 11 of 72 | 13 of 72 | 17 of 72 |

**The trade.** A lower setting lowers every jam force. It also lowers the
current the motor draws while the hub slides, and that current is what trips
the cutoff. So the cut comes later and the margin over the trip shrinks.
At 0.9 N m the margin is 1.30x against the rule's 1.1x. That is comfortable.
At 0.8 N m it is 1.17x.

**Where it breaks.** The firmware ramps each start over 100 ms because the
coupling's free play rings a switched start up to more than twice its torque.
With that ramp, neither 1.0 nor 0.9 N m slips the hub on any start at any
stiffness or play in the sweep. At 0.8 N m, an empty belt with a stiff, worn
spider (80 N m/rad, 5 degrees of play) slips it on 3 of 6 starts. So 0.9 is
the lowest of the three settings that keeps every soft start stuck. That is
the new default.

**What changed downstream.** The tooth check's jam pull drops from 100 to
90 N, so the drive pulley's teeth are 7.6x stronger than they need to be,
up from 6.8x. The ratchet margin doesn't move: with the slack strand at zero
it does not depend on the pull. On the bench, the hub is now set with a belt
strip round the pulley to 71 N on a luggage scale, down from 79.

**Not known.** The facing's real friction, and how far it drifts with wear,
damp and heat. The sweep assumes plus or minus 20%. The gap between 0.9 and
a start slip on a worn spider is the number to check first on a real
machine: a hand-held stall, then ten empty starts with an old spider.

Data and method: `ventures/open-tennis-robots/cad/README.md`, "Slip hub back
to 0.9 N m", and the three sweep outputs in
`ventures/open-tennis-robots/eval/lift-slip-*-2026-11-15.txt`.
