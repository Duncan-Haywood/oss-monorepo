---
title: "The tennis feeder that would have tripped its own battery"
seo_title: "DIY tennis ball machine wiring: fuses, BMS limit and a soft-start ramp"
date: 2026-11-14
tags: [open-tennis-robots, hardware, firmware, electronics]
description: "Sizing the open tennis feeder's fuses found a firmware fault: two launcher wheels starting from rest could ask about 98 A of a 30 A battery."
---

The open tennis-ball feeder runs everything from one 24 V LiFePO4 battery: two
launcher motors on hobby ESCs, two base gearmotors and an elevation actuator on
an H-bridge, a ball-lift motor, a hopper agitator, a stepper, a servo, and a
Raspberry Pi. Until today the wiring notes said "fuse the battery positive,
about 30 A". This session replaced that guess with a model in the CAD package,
which picks one fuse per branch and checks the whole machine against the
battery. The first thing the model found was a firmware fault.

## Sizing the fuses

For each branch the model takes the running current and the stall current. The
fuse is the smallest standard blade rating that is at least 1.25 times the
running current and at least half the stall current. A motor draws its stall
current for a few milliseconds every time it starts, and a blade fuse at twice
its rating takes 0.15 s or more to open, so half the stall current is safe. The
wire is the thinnest gauge that can carry the fuse's rating, never thinner than
20 AWG. The fuse is there to protect the wire.

| Branch | Running | Fuse | Wire |
| --- | --- | --- | --- |
| Launcher ESC (each of two) | 6.4 A | 15 A | 16 AWG |
| H-bridge: base and elevation | 6.0 A | 7.5 A | 20 AWG |
| Ball lift | 2.0 A | 3 A | 20 AWG |
| Agitator | 0.8 A | 1 A | 20 AWG |
| Stepper driver | 0.3 A | 1 A | 20 AWG |
| Servo and Pi bucks | 0.8 and 0.6 A | 2 A each | 20 AWG |
| **Battery feed** | **23.3 A** | **30 A** | **12 AWG** |

Every current here is an assumption taken from the part classes in the bill of
materials. Nothing has been built or measured yet. The 30 A main fuse now comes
out of the model and is no longer a guess. The Pi's buck converter takes its
power ahead of the e-stop contactor, so the Pi and the motor controller stay on
through an emergency stop and can report it.

## The 98 A start

The 6.4 A in the launcher rows is not what the old firmware would have drawn.
Its speed loop sets the throttle from the target speed straight away. So a wheel
starting from rest gets a large throttle step, and the motor can pull close to
its peak, about 1 kW. At 24 V that is about 49 A per ESC, or 98 A for the two
wheels together. The model assumes the pack's BMS allows 30 A continuous, which is an
assumption to check against your own pack's label. When the BMS sees an overload it cuts the pack, and the Pi and the
ESP32 lose power along with the motors. The first drill of the day would end
with a dead robot.

The fix is a ramp in the firmware. A new wheel speed now moves toward its target
at no more than 1,500 rpm per second at low speed. Above that it rises at a
constant 100 W of shaft power per wheel. Constant power means the square of the
speed grows at a steady rate, 2P divided by the wheel's inertia. A stop is still
immediate. With both wheels ramping and every other load running, the machine
draws 23.3 A. That is under 80% of the BMS's 30 A. A test fails if the
firmware's ramp numbers disagree with the CAD's.

## The tachometer made the first ramp too fast

The first version allowed 6,000 rpm per second at low speed. On the simulated
feeder, which runs the real firmware against a modelled wheel, a wheel's peak
shaft power still reached 436 W, four times the cap. The cause was the
tachometer. It gives one pulse per revolution, so for the first few
revolutions it reads zero. The speed loop sees a large error and pushes the
wheel past its ramp. A gentler start fixed it:

| Low-speed cap | Worst steady time | Worst per-wheel peak |
| --- | --- | --- |
| no ramp | 2.4 s | 2,643 W (simulated wheel, no current limit) |
| 6,000 rpm/s | 3.6 s | 436 W |
| 2,000 rpm/s | 4.3 s | 130 W |
| 1,500 rpm/s | 4.9 s | 110 W |

At 1,500 rpm per second the cost is a slower start from rest. The wheels are
steady in 4.9 s at worst, against 2.4 s before. A drill pays that once. Speed
changes between shots are much smaller than a start from rest.

## What is still open

The model doesn't cover the ESCs' input capacitors charging when the contactor
closes, which is hard on contacts and on a BMS's short-circuit trip. It doesn't
cover braking ESCs pushing current back into the pack, or the speed loop
catching up after each ball. That last gap is why the ESC fuses are twice the
ramped draw. On the first build, someone should log the battery current with an
inline meter while the wheels spin up. They should also weigh a launcher wheel,
because the ramp's power cap depends on the wheel's inertia.

The model is `Feeder.power_distribution` in the
[open tennis robots CAD](../../ventures/open-tennis-robots/cad/README.md), the
ramp is `controller.SpinupRamp` in the
[ESP32 firmware](../../ventures/open-tennis-robots/firmware/esp32/README.md),
and the fuse table is in
[the electronics notes](../../ventures/open-tennis-robots/hardware/electronics.md).
All of it is MIT licensed.
