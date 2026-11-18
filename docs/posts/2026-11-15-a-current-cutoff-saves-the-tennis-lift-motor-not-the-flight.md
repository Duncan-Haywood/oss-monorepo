---
title: "A current cutoff saves the tennis lift's motor, not its flight"
seo_title: "Stall cutoff for a belt elevator gearmotor: shunt and comparator"
date: 2026-11-15
tags: [open-tennis-robots, hardware, electronics, firmware]
description: "A shunt and comparator let the tennis feeder cut a jammed ball lift in 30-90 ms. The simulation also showed what no cutoff stops: the rotor's inertia."
---

The open tennis-ball feeder sends returned balls back to its hopper on a
cleated belt, 2.36 m up a column beside the mast. Each flight on the belt is
a printed plate on a cleat that the belt's supplier welds on. Until today the
belt's gearmotor ran from a plain MOSFET on the ESP32 and nothing watched
it. If a ball caught between a flight and the boot or the hood, the motor
stalled and stayed stalled for the 16 s run-on, and every ball fed restarted
the timer.

Every number below comes from assumed part figures in
`ventures/open-tennis-robots/cad/otr_cad/params.py`. Nothing has been built.

## Why the fuse does not cover it

The lift's branch fuse is 3 A, sized to let the motor start. An assumed
37 mm 24 V gearmotor stalls at 5.5 A cold. With the winding 80 K over
ambient and the pack at its 24 V cut, the stall drops to 4.1 A. That is 1.37
times the fuse, a load a blade fuse can carry for minutes. Meanwhile the
winding takes about 186 W at a full pack, and one printed plate holds the
whole stall torque.

## The sense circuit

There was no free ADC pin on the feeder's ESP32, so the cutoff uses a
comparator and one digital input:

- a 0.05 ohm shunt in the MOSFET module's source, so it only sees current
  while the MOSFET conducts;
- 10k and 100 nF into an LM393, which averages the 20 kHz PWM;
- a 100k / 3.9k divider from 3.3 V as the reference: a trip at 2.48 A, or
  2.18 to 2.78 A with the rail, the resistors and the comparator's offset
  at their worst;
- the open-collector output on GPIO 0.

GPIO 0 is a strapping pin. Pulled low at reset, it starts the serial
bootloader. Here that can't happen: at reset the lift's MOSFET is off, no
current flows in the shunt, and the comparator lets go of the pin.

The CAD checks the trip window both ways. The lowest trip still leaves the
motor 4.1 times the torque a fully loaded belt needs. The highest is 1.48
times under the hot, low-battery stall.

## The firmware

A motor starts at its stall current, so `LiftRun` ignores the comparator for
300 ms after each start. After that, two readings over on ticks 10 ms apart
cut the motor. It rests 2 s and tries again once. After a second stall it
stays off and sets a new telemetry flag, `FLAG_LIFT_JAM`.

Only the switched bus dropping clears that flag, which happens when someone
presses the e-stop to reach in. A watchdog, an ESTOP frame from the Pi or
another ball fed does not clear it, because none of them means a person has
touched the jam. The drill runner on the Pi logs the flag once and carries
on, since the hopper still holds balls.

## What the simulation says

`tests/lift_jam_sweep.py` runs the real firmware on the simulated board. It
adds a plant model at 0.1 ms steps: the motor with its inductance, the belt's
load, the flyback diode, the shunt, the filter and the comparator. A jam is a
ball pressed by a flight. At the boot the only spring is the ball itself, at
14.3 kN/m from the ITF's deformation test. At the hood the ball is in series
with 2.36 m of belt.

| | result |
| --- | --- |
| Starts with every flight loaded (12 cases) | none trip; comparator on for 15 to 114 ms of the 300 ms blanking |
| A jam at speed (24 cases) | cut 29 to 89 ms after contact; lift gives up 2.3 to 2.5 s later |
| Energy in the winding, 6 s after the jam | 12 to 34 J with the cutoff, 576 to 1,108 J without |

So the cutoff does the job it was built for. The motor, the fuse and the
flight no longer sit under a held stall.

## What it can't do

The peak force on the flight barely moved. The gearmotor's rotor (assumed
3e-6 kg m^2 through a 30:1 gearbox) behaves like 18 kg moving with the belt.
When a boot jam stops that mass against the ball, the force peaks within
about 55 ms. With a full pack and the assumed rotor, the flight sees 149 to
163 N before the cut. The retry is a start into a ball that is still
squashed, and it reaches 172 N. The printed plate is rated at 156 N
(20 MPa). The cleat's weld is rated at 282 N, so it holds.

Two cheaper changes would help a little. Cutting on one reading instead of
two would bring the first peak at the assumed rotor from 149 to 129 N. A
soft-start retry would trim the retry's overshoot. The real fix is
mechanical: a torque-limiting slip coupling between the gearmotor and the
drive pulley, so the rotor's energy goes into the slip and not the plate.
That is the next CAD item for this project.

## What a builder should measure

- Scope the shunt on a real start and on a stall held by hand.
- Read the real gearmotor's rotor inertia and ratio from its datasheet.
  The impact force scales with the square root of the inertia.
- Check the comparator's real offset.

Each of these goes back into the same parameters and the same sweep.

Code and numbers: `ventures/open-tennis-robots/cad/README.md`, "Lift jam
cutoff"; wiring in `hardware/electronics.md`.
