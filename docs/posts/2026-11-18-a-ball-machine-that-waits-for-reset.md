---
title: "Releasing the e-stop should not restart a ball machine"
seo_title: "DIY ball machine: e-stop release should not restart it"
date: 2026-11-18
tags: [open-tennis-robots, safety, electronics, hardware]
description: "The open tennis feeder now needs RESET pressed at the machine after an e-stop. One relay and one push button do it, with no ESP32 pin needed."
---

The open tennis feeder has a hard-wired emergency stop. Pressing it opens a
contactor, and every motor loses power. Until today, though, releasing it gave
the power straight back. The only other step was a `CLEAR_ESTOP` command, and
since this week's phone page, anyone on the home network can send one. A
quality audit on 2026-11-08 flagged this, and it has been the project's last
open safety item since.

The standard rule (ISO 13850 says it, and so does common sense) is that
resetting an emergency stop must not restart the machine. Restarting should
be a separate, deliberate act, done by someone standing at the machine.

## One relay and one button

The feeder's ESP32 has no free pins, so the fix is all hardware:

- A small 24 V relay, K0, sits after the e-stop and the wireless fob. Its coil
  is fed through a RESET push button's normally-open contact, in parallel with
  one of K0's own contacts, so once K0 is set it holds itself. Any cut (the
  e-stop, the fob, a broken wire, the pack being unplugged) drops it, and only
  RESET sets it again.
- The precharge relay and the contactor's timer now take their feed from K0
  through RESET's normally-closed contact. Pressing RESET sets the latch but
  opens that feed, so the bus starts charging when the button is **let go**,
  and the motors have power 0.5 s later. A RESET button that is jammed or
  taped down never powers the motors.

The board doesn't need to know about RESET. While K0 is open, the
contactor's coil is off, and the ESP32 already watches that coil on GPIO 15.
The telemetry keeps reporting the bus as off. The drill runner and the phone
page now tell you to "release the e-stop and the fob, then press and let go
of RESET on the feeder" instead of just failing to start.

## How it was checked

The CAD build now models the switching logic in 1 ms steps from power-up.
The build fails if any of these happens:

- the motors get power at switch-on, or while RESET is held;
- power comes back after an e-stop or fob release, or while RESET is taped down;
- a RESET pressed while the e-stop is still down counts;
- the relay contact or the button's contact carries more coil current than its
  rating (about 0.32 A against an assumed 1 A DC rating for the button).

The build also fails if the latch is switched off. The simulated feeder, which
runs the real firmware, has the latch too. In the tests, an e-stop followed by
a release and a clear leaves the bus off, the next drill stops at connect with
the RESET message, and after RESET and a clear, the same drill feeds all four
balls.

## Where it can still fail

There is one single fault the design can't catch: RESET's normally-open
contact welding shut. Then the latch sets itself on any release, and the
machine is back to how it was before this change, with power returning on
release and a `CLEAR_ESTOP` still needed. A commercial safety relay with a
monitored manual reset covers that case, at more cost. The coil currents and
contact ratings above are assumptions, and nobody has wired this on a real
machine yet. On every build, press the e-stop, release it, and check that the
wheels stay dark until you press RESET.

The circuit and its numbers are in the project's
[electronics notes](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/open-tennis-robots/hardware/electronics.md),
under "Reset at the machine".
