---
title: "The tennis feeder's brake guard was reading its own brake"
seo_title: "A regenerative-braking guard that read its own brake: hysteresis"
date: 2026-11-14
tags: [open-tennis-robots, hardware, electronics, firmware]
description: "Braking lifts the very battery reading that decides whether the ESCs may brake, so one threshold flipped every 10 ms. A 700 mV band from the model fixes it."
---

Earlier today the open tennis-ball feeder got a rule for slowing its
launcher wheels: brake through the ESCs (the energy goes back into the
battery) while the pack reads 27.6 V or less, and coast above that, because
braking into a nearly full LiFePO4 pack can push a cell past the BMS's cut
and leave the braking current nowhere to go. That rule was checked for one
slow-down. This run asked what happens over many ticks and many slow-downs,
and what several contact bounces in a row do to the e-stop contactor. Every
figure below comes from assumed part values in `cad/otr_cad/params.py`; no
feeder has been built.

## The guard sees itself

The ESP32 reads the pack every 10 ms on a divider that taps the wire between
the main fuse and the contactor. That point carries current. When both wheels
brake, about 5.4 A flows back into the pack across roughly 48 milliohms of
cells, BMS switches, wire and fuse, so the reading rises about 0.26 V. When
they coast, the Pi and the idle loads pull it about 0.04 V low.

So a pack resting at, say, 27.5 V reads 27.5 V, the guard allows braking,
the next reading is 27.76 V, the guard switches to coasting, the reading drops
back, and it brakes again. Add an assumed 0.15 V of ADC noise and the model,
stepping the guard tick by tick through a 1.3 s slow-down, flips on every
one of 127 ticks for any pack resting between 27.19 and 27.78 V. A LiFePO4
pack sits in that range for a while after it comes off the charger.

The simulated board, which runs the real firmware against invented wheel
physics, showed the same thing: with the reading lifted 260 mV whenever an
ESC is driven slower than its wheel, a 5,000 to 4,000 rpm slow-down flipped
21 times.

## A band, sized from the model

The fix is ordinary hysteresis, but the width comes out of the model rather
than a guess. Braking still stops the moment the reading passes 27.6 V, so
the pack is never braked into above the old limit. It starts again only once
the reading is under 27.6 V less a band that has to exceed the braking rise,
plus the coasting sag, plus twice the noise: 0.60 V here. The firmware uses
700 mV (`REGEN_BRAKE_HYST_MV`). With it the sweep flips at most once per
slow-down, and on the simulated board the wheel coasts the rest of the way
and still lands on 4,000 rpm.

Two side results from the same model. One 20% slow-down of both wheels
returns about 215 J, so it takes 86 of them to add 1% to a 512 Wh pack:
brakes in a row cannot creep the pack toward the cut. And a slow-down that
starts while the wheels are holding speed reads the pack 0.18 V low, which
lets braking start from a slightly fuller pack than the threshold suggests;
the highest cell then reaches 3.60 V instead of 3.58 V, still under the
3.63 V the design check allows.

## Bounces in a row

The contactor's contacts bounce when they close. The earlier model took one
10 ms bounce after a close that had fully charged the bus. The new one splits
the window into 1 to 10 opens and integrates the loop step by step. With
only the idle loads, the count does not matter: no make in 24 patterns
exceeds 19.3 A, the precharge closing itself, because the precharge relay
holds the bus during every open.

It did find the old figure was optimistic for one case. If the firmware
enabled the stepper driver the moment the coil energised, a first touch too
short to charge the bus lets the driver's load pull the bus about 1 V lower
during the open, and the re-close makes 32.1 A, not 24.9 A. That is still
under the assumed 60 A make rating, and the firmware already waits 150 ms
before enabling the driver.

What would settle these numbers: the battery reading logged through a real
slow-down with the motors running, the real pack resistance, and a scope on a
real contactor's contacts. The write-up with every assumption is in the
venture's `cad/README.md`, "Brakes and bounces in a row".
