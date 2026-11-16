---
title: "The tennis feeder notices an empty hopper from its own wheels"
seo_title: "Detecting an empty ball hopper from launcher wheel speed"
date: 2026-11-16
tags: [open-tennis-robots, firmware, hardware]
description: "No ESP32 pin was left for a break-beam, so the tennis feeder now judges each feed stroke by how much its launcher wheels slow when a ball goes through."
---

The open tennis-ball feeder drops one ball at a time into a shuttle, which
carries it forward into two spinning wheels. When the tub ran dry, nothing
noticed. The shuttle stroked an empty pocket, the firmware counted a ball
fed, and the Pi's drill runner carried on. The drill ended on a release
timeout or "finished" with shots that never flew. The protocol had a
`FLAG_HOPPER_EMPTY` bit from the start, but no code ever set it.

**The plan was a break-beam across the feed column, and it could not be
wired.** The feeder's ESP32 drives two ESCs, a stepper, a linear actuator,
the shuttle servo, the base motor, the ball lift and the agitator. It also
reads two tachometers, an encoder, a pot, the e-stop, the contactor's coil
and the lift's current comparator. On a WROOM-32 module that takes every
exposed GPIO except 1 and 3. Those two are the USB console the firmware is
flashed over. A beam would need a pin freed first, or an I/O expander.

**The wheels already know.** A ball squeezed between the launcher wheels
takes its momentum from them. Their two pushes add up to the ball's linear
momentum, and the difference between them gives the ball its spin. So each
wheel loses a predictable share of its speed, whatever slips or heats up on
the way. With the CAD's figures (a 57 g ball, 75 mm wheels, 0.00155 kg m² of
wheel and rotor) and the launcher's 0.85 speed efficiency, a flat shot slows
each wheel by 8.8%, at any speed. Whatever the spin, the faster wheel slows
by at least half that. An empty pocket slows nothing. The tachometers
already time every revolution.

**What changed.** The firmware now watches each forward stroke
(`controller.LaunchCheck`). It notes the lowest single-revolution speed of
each wheel, then judges the wheel with the larger predicted drop: a ball
went if that wheel fell by a quarter of its prediction, and by 1.5% at least.
A dry stroke sets the flag. The Pi's runner then stops, names the shot that
went dry and how many flew, and stops the wheels without latching the
e-stop. The person refills the tub and runs the drill again. The command
exits 3 for this, so a script can tell it apart from a fault.

**Two traps came up while testing it.** The first version took the speed
from the tachometer's usual four-revolution average, and also counted a
dry last shot as a launch. The Pi stops the wheels after the last shot, and
the stop looked exactly like a ball. The check now stops taking readings
the moment the wheel targets change. The average was the second trap. At
1,500 rpm four revolutions take 160 ms, and the Pi re-aims for the next
shot about that soon. A heavy wheel's drop then read as low as 0.47 of the
threshold. The check now reads the last single revolution instead.

**How much margin, on the simulator.** A sweep runs the real firmware on
the simulated feeder for six shots: flat at 1,500, 3,000 and 6,500 rpm,
heavy topspin, heavy backspin, and 7,000/2,500. Each shot runs on 27 builds
that differ from the config: the wheel 0.7 to 1.5 times as heavy, the ball
taking 60% to 100% of the modelled momentum, and the wheels lagging 0.2 to
0.8 s. The simulated Pi re-aims the instant each release is counted, sooner
than a real one can. Loaded strokes read at least 1.26 times the threshold
and dry ones at most 0.17 times.

**What it does not show.** The simulated wheels are first-order lags, and
the ball's momentum leaves them in one instant. A real ball stays in
contact for a few milliseconds, and a real ESC may recover faster. No
feeder has been built. The first one should log the measured drop for a
few dozen real shots and dry strokes and check that they fall either side
of the threshold. The drop has a second use: it measures each ball's
momentum, so it could fit the launcher's speed efficiency without a radar
gun. That is the next item on the project's list.

Code, sweep and margins: `ventures/open-tennis-robots/firmware/esp32/README.md`,
"Empty hopper", and `tests/launch_check_sweep.py`.
