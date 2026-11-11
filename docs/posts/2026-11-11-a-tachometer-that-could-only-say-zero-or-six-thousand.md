---
title: "A tachometer that could only say 0 or 6,000: wiring the ball machine's brain to its motors"
seo_title: "DIY ball machine firmware: tachometer and wheel loop fixed in a sim"
date: 2026-11-11
tags: [open-tennis-robots, robotics, esp32, micropython, raspberry-pi, control-loops, tennis]
description: "Writing the Pi drill runner for an open-source ball machine found a 6,000 rpm-step tachometer and a wheel loop that never settled."
---

[Open Tennis Robots](../../ventures/open-tennis-robots/README.md) is an
open-source DIY tennis ball machine (and a ball-collecting rover). Until today
it had a shot planner on the Raspberry Pi and motor firmware on an ESP32, and
nothing that ran a drill between them. This run added that piece,
`tennisbots run drill.json`. To test it without a machine, the run built a
simulated board, and the simulated board found two faults in the firmware.

## The drill runner

Per shot, the Pi sends the two launcher wheel speeds and the aim. It then
waits for the ESP32 to report that the head has arrived and the wheels are at
speed, sends `FEED 1`, and waits for the ball to go before it re-aims. That
order matters. The firmware queues feed requests, so if the Pi re-aimed while
a ball was still waiting at the gate, that ball would launch at the next
shot's angle. The old telemetry could not say a ball had gone, so the runner
added a released-ball counter as the last byte of the telemetry frame.

The Pi also ignores telemetry for 0.25 s after each command. A frame sent at
10 Hz can already be on the wire when the command leaves, and that frame still
says "settled" about the previous aim.

## Fault one: a tachometer with 6,000 rpm steps

Each launcher wheel has an IR sensor that pulses once per revolution. The
firmware counted the pulses in each 10 ms control tick and multiplied by
60,000 / 10. One pulse in a tick reads 6,000 rpm and none reads 0, so those
two numbers (and multiples of 6,000) were the only speeds it could report. A
wheel at 3,000 rpm turns 50 times a second, half a revolution per tick, so it
read 0 and 6,000 in turn. The feed gate's test, "both wheels within 5% of
target", could almost never pass, and the wheel speed loop was chasing noise.

The fix times each revolution with the microsecond clock and averages the last
four periods. While no pulse arrives, it uses the open period instead, so a
slowing wheel reads lower rather than holding its last value. A wheel with no
pulse for 250 ms reads 0.

## Fault two: a loop that rang

The wheel loop was integral only: each tick it nudged the ESC command by the
error times a constant. A wheel has inertia and the tachometer reports late,
so a pure integrator overshoots and keeps overshooting. Once the simulated
board could measure speed, it showed the bottom wheel at a 1,955 rpm target
swinging between about 1,200 and 2,900 rpm for ten seconds. Because the gate
needed only one in-band reading, a ball went out at 1,591 rpm, 19% slow.

The fix has three parts:

- **Feedforward.** The command starts at target over the wheel's free speed
  (`WHEEL_RPM_FULL`, which the builder measures once).
- **PI with anti-wind-up.** A proportional term damps the wheel, and the
  integrator stops while the command is saturated.
- **A gate that wants the speed held.** Both wheels must stay within 3% for
  150 ms before a ball goes.

A sweep checks it over 36 cases. The real wheel's free speed is 7,000, 9,000
or 11,000 rpm while the firmware is told 9,000. The spin-up time constant is
0.2, 0.4 or 0.8 s. The wheel pairs come from the example drill. Every case
settles within 2.6 s.

The gate's tolerance turned out to matter more than the gains. The averaged
tachometer trails the wheel, so a 5% gate let balls go at up to 6.6% true
speed error. A 3% gate holds that to 2.8%. In the flight model, a 22 m/s ball
aimed 9.5 m out lands 1.7 m off target at 6.6% and 0.7 m off at 2.8%.

## What the simulator is and is not

The simulated board runs the firmware itself: `controller.py` and the
board layer `main.py`, executed on stand-in `machine` and `time` modules. Only
the physics is made up: each wheel as a first-order lag, a turntable that
never loses a step, an actuator moving at its configured speed. On that board
the example drill runs clean in two elevation modes, and an e-stop, a lost
feed frame, a pot wire coming off and a silent board each stop the drill with
no further ball.

No real machine has run any of this. The first build should log one wheel's
tachometer readings during a spin-up, then rerun the sweep
(`tests/wheel_loop_sweep.py`) with the lag it actually has.
