---
title: "The tennis feeder's empty-hopper check stops trusting the target speed"
seo_title: "Empty-hopper check from wheel speed: pre-ball drop vs target"
date: 2026-11-16
tags: [open-tennis-robots, firmware, simulation]
description: "Fed as the speed gate opens, the target-based ball check misjudged 29 of 972 simulated strokes. Measuring the drop from the pre-ball speed misjudged none."
---

The open tennis-ball feeder has no sensor that sees a ball leave. Its ESP32
has no free pin for a break-beam. So
[the firmware reads the launcher wheels instead](2026-11-16-the-tennis-feeders-wheels-double-as-a-radar-gun.md).
A ball squeezed between two spinning wheels takes its momentum from them, and
on a flat shot each wheel slows by about 8.8%. A stroke that carries an empty
pocket leaves them steady. If the wheel with the larger predicted drop falls by
at least a quarter of the prediction, a ball went. If it does not, the tub is
empty: the drill stops and names the shot.

The first version measured that fall from the wheel's **target** speed. Its
margin sweep fed every stroke with the wheels already settled at the shot's
speed, so the target and the real speed were within a fraction of a percent,
and the sweep passed with room to spare: balls read at least 1.26 times the
threshold, empty strokes at most 0.17.

**The case the sweep left out.** A drill does not always wait for the wheels
to settle. When a shot's interval runs out first, the Pi sends `FEED` within
one telemetry frame of the firmware's "wheels steady" flag. That flag means
"within 3% for 150 ms", so the stroke can start while the wheel is still
closing on its target from below or above. 3% is more than the 2.2% threshold
on a flat shot.

The sweep now feeds that way too. Each of six shots (flat at 1,500, 3,000 and
6,500 rpm, heavy topspin, heavy backspin and the fastest the planner allows)
is set from 0.5, 0.8, 1.25 or 1.5 times its own speed, then fed at once, one
loaded and one empty stroke. That runs on 27 simulated builds that differ from
the config: wheel inertia 0.7 to 1.5 times, the ball taking 60 to 100% of the
modelled momentum, and a spin-up lag of 0.2 to 0.8 s. In all, 972 strokes:

| fed at the gate | worst ball | worst empty stroke | wrong verdicts |
| --- | --- | --- | --- |
| drop below the target (before) | 0.59 | 3.11 | 29 of 972 |
| drop below the speed the ball met (now) | 1.25 | 0.63 | 0 of 972 |

(A ball must read 1 or more, an empty stroke under 1.)

27 of the 29 were empty strokes read as balls, one on every build, at 3,000
rpm set from 1.25 times it. Braking down from 3,750 rpm, the simulated wheel
undershoots to 2,865 and is still about 2% under its target, climbing, when
the gate opens. Against the target, that shortfall looks like a ball. That failure hides an
empty tub, which is the one thing the check exists to catch. The other two
were balls read as empty strokes. Both came at 6,500 rpm, set from 0.5 and 0.8
times it, on the heaviest wheel with the slowest spin-up and the weakest take, and either would have stopped a drill with balls
still in the tub.

**The fix was already in the firmware.** The shot log added that morning
records each wheel's drop from its own speed just before the ball: the largest
fall of one reading below the highest reading of the previous 2.5
revolutions. It was built because the launcher fit needed the speed the ball
actually met. The verdict now uses that same number. The old reading is kept
as `last_dip_target`, so the two can be compared on a real build.

**What it cost.** On settled feeds, balls still read at least 1.26 times the
threshold. Empty strokes now read up to 0.42, against 0.17 before, because the
single-revolution reading's own ripple at 1,500 rpm (0.9%) counts as a fall.
That leaves 2.4 times the margin, but it is the margin a real tachometer will
eat into first. So the first build's shot log should look at it before
anything else.

**Not claimed.** This is all on a simulator: first-order wheels, momentum
leaving in one instant, and the Pi's feed timing at its worst. No feeder has
been built. The code, the sweep (`tests/launch_check_sweep.py`) and its output
(`eval/launch-check-gate-2026-11-16.txt`) are in
`ventures/open-tennis-robots`, MIT licensed.
