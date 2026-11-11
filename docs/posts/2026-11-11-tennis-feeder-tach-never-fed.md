---
title: "The ball machine that would never have fed a ball: running the firmware on a simulated board"
seo_title: "DIY tennis ball machine: why a 1-per-turn tach needs pulse timing"
date: 2026-11-11
tags: [open-tennis-robots, firmware, simulation]
description: "The open tennis feeder's firmware counted tach pulses per 10 ms and could only read 0 or 6,000 rpm, so its feed gate never opened. A simulated board found it."
---

The open tennis-ball feeder's ESP32 now waits for its head to finish aiming
before it releases a ball ([the elevation firmware post](2026-11-11-tennis-feeder-elevation-firmware.md)).
The next job was the other end of the cable: the Raspberry Pi has to send each
shot of a drill, wait until the head has arrived, feed one ball, and not re-aim
until that ball has gone. That is now `tennisbots play`.

To test it without a board, the firmware itself runs in the test: `main.py` and
`controller.py`, unchanged, on stand-in `machine` and `time` modules wired to a
small plant model. Step pulses turn a simulated turntable, which closes the home
switch at -32 degrees. PWM drives a simulated actuator whose pot reads back. The
launcher wheels spin up toward the throttle and send one tach pulse per turn at
the exact moment they cross it. Every time the gate servo opens, the plant logs
one ball with the angles the head really had.

## The first run fed nothing

The first drill against the simulated board timed out on shot one with every
ball still in the hopper. The aim had settled. The gate was waiting on the
wheels.

The firmware counted tach pulses in each 10 ms update and multiplied by 6,000
to get rpm. With one pulse per turn, a wheel at 3,000 rpm makes half a pulse
per update, so the reading flips between **0 and 6,000** and never lands near
3,000. Wheels at 2,000, 3,000 or 4,500 rpm read the same two numbers. The gate
only opens with both wheels within 5% of their targets, so on a real build it
would never have opened.

The fix times the gap between pulses instead, in microseconds inside the
interrupt. At 7,000 rpm that gap is 8.6 ms, so microsecond timing resolves the
speed far better than the gate needs. In the simulation the tach now reads the
wheel to within 0.5%. A regression test puts the old counting code back and
checks that it still feeds nothing.

## What the drill player waits for

For each shot the Pi sends the wheel speeds and the aim, and then it waits:

- **for a frame the board built after the new aim.** A telemetry frame sent just
  before the board read the command can still be on the wire, and it shows the
  *old* aim as settled. The player ignores the first frame after a send unless
  that frame already reports "settling".
- **for the wheels to hold within 2% for 300 ms.** Without the hold, one
  simulated ball left 381 ms after the feed command with the top wheel 5.2%
  slow. The tach reports the last full turn, so it lags a wheel that is still
  swinging toward its speed.
- **for the ball to be gone before it re-aims.** The Pi cannot see the release,
  but it knows the board's rule. So it holds the aim until telemetry has stayed
  ready for 700 ms, longer than the gate's whole cycle.

It also refuses shots the head cannot make, such as a 40-degree turn on a
30-degree turntable. The firmware would quietly clamp them, and the ball would
fly somewhere the drill never asked for.

## What the simulation says, and what it assumes

Playing the example drill (two corners, a short backspin ball, a deep wide one)
three times, with every ball checked against the aim it left with:

| | rc / pot actuator | timed actuator |
| --- | --- | --- |
| first ball (azimuth homing) | 7.7 s | 12.3 s |
| average shot after that | 3.8 s | 5.6 s |
| aim at release | within 0.25 deg | within 0.25 deg |

The surprise is where the time and the misses come from: the wheels, not the
aim. Two corner shots with the same speeds follow each other in 1.0 s. A 900 rpm
change takes 2.1 s, and changes of 1,300-3,400 rpm take 4.3-4.6 s. Landing scatter
follows the wheel band, not the angles. At 4% the balls landed up to 0.5-0.6 m
from their targets, at 2% up to 0.2-0.3 m and at 1% 0.14-0.21 m, and each
halving of the band cost about 0.6 s a shot. The default is 2%. The timed
actuator, which estimates position from the clock, re-homes once a round of
this drill when its error budget runs out.

All of those timings rest on numbers nobody has measured: the wheel model
(9,000 rpm at full throttle, a 0.3 s time constant) and the actuator speeds
from datasheets. What the simulation does establish is behaviour: one ball per
shot, never one in flight while the head moves, and a stop on e-stop, lost
telemetry or a cut pot wire. The firmware's wheel loop is integral-only and
underdamped on the assumed wheels. Tuning it needs a real ESC and motor on a
bench, and that is the next thing worth measuring.

Try it from a checkout: `tennisbots play drill.example.json --sim pot`. On the
real thing it is `--port /dev/ttyAMA0`. The code, firmware notes and tests are
in [ventures/open-tennis-robots](../../ventures/open-tennis-robots/firmware/esp32/README.md).
None of it has run on a board yet.

*No warranty. Not engineering or safety advice. Ball launchers can injure
people: bench-test with the wheels off.*
