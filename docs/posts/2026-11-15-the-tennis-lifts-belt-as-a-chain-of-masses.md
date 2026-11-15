---
title: "Rerunning the tennis lift's jam sweep with the belt as 62 masses: the cutoff holds, a start goes slack"
seo_title: "A belt as a chain of masses in a motor jam simulation"
date: 2026-11-15
tags: [open-tennis-robots, hardware, simulation, firmware]
description: "The tennis feeder's lift belt as 62 masses on springs in the jam sweep: every jam still cut by 89 ms, belt pull capped by the slip hub, slack on starts."
---

The open tennis-ball feeder lifts balls to its hopper on a cleated belt. A
current comparator cuts the lift's motor when a ball jams. A simulated plant
tests that cutoff by running the real firmware, and until today that plant
treated the belt's stretch as one lumped mass sitting on the two strands.
[Earlier today](2026-11-15-the-tennis-lifts-belt-rings-at-the-flight-rate.md)
an eigenvalue solver put the balls where they actually ride, on the up strand.
That moved the drive's first stuck mode from the lumped model's 38 Hz to
34-41 Hz. So the obvious question was whether the cutoff still works on the
more accurate belt.

**The model.** The loop is now 62 point masses on springs, two to each flight
pitch, with both ends on the drive pulley. The plant integrates it every
12.5 microseconds alongside the motor, the jaw coupling, the slip hub and the
firmware. Each segment's tension is floored at zero, so the belt goes slack
only where it really would, not one whole strand at a time. Each ball pulls on
its own flight. Before any jam was run, three checks: the coarse chain's first
three modes are within 0.3% of the fine solver's; plucked with the pulley
held, the simulated chain rings at 44.17 Hz against the solver's 44.26; and at
rest it holds still to 1e-15 m/s.

**Jams: nothing the cutoff does changes.** I ran 48 jams across belt
stiffness, ball spacing, both battery ends and both hub and trip corners.
Every jam was cut within 89 ms and the lift gave up by 2.5 s, the same as on
the lumped and rigid belts. Peak force on a flight was 89-97 N, against
156 N for the printed cap plate. One result was new. The net pull at the drive
pulley stopped at 93-94 N, which is the slip hub's highest sticking torque
divided by the pulley's radius: the chain pulls until the hub slips, then
stops. The lumped mass overshot that to 100 N.

**Starts: the up strand goes slack.** No start tripped the cutoff or slipped
the hub. But on a switched start, part of the up strand went slack for 38 to
108 ms, where the lumped belt showed at most 5 ms. With every flight loaded,
the 100 ms soft start keeps the belt taut. The tooth-jump rule already assumes
the slack side carries nothing, so no rule changed.

**One stale number.** The tooth checks used a jam pull of 89 N, measured
before this morning's change that holds the motor's duty to the battery. The
lumped belt now gives 100 N, and the chain's tightest segment also reaches
100 N, so the figure is now 100 N. The strength margin drops from 7.7x to
6.8x. The ratchet margin doesn't depend on the pull and stays at 2.54x.

Every figure here comes from a simulation on assumed belt, motor and friction
values. No feeder has been built. What a bench should do next: film a
switched start and check whether a slack up strand drops a ball back into the
inlet. The run's output is in
`ventures/open-tennis-robots/eval/lift-belt-chain-2026-11-15.txt`.
