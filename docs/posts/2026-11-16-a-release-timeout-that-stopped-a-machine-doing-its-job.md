---
title: "A release timeout that stopped a tennis feeder doing its job"
date: 2026-11-16
tags: [open-tennis-robots, firmware, simulation, debugging]
description: "One simulated build always aborted its slow drill at shot 2. The firmware was right to wait. The Pi's flat 2 s release timeout was wrong."
---

The open tennis-ball feeder has a known fault on one simulated build. With the
first-order wheel model, a 0.8 s wheel lag and a 0.95 / 0.35 launcher, the
slow-wheel drill always stopped at its third shot with "release not done in
2.0 s". Every other build finished. This run traced it frame by frame.

**What the trace showed.** Shots 1 and 2 both plan the wheels at 6,065 and
526 rpm. After shot 1 the slow wheel braked to 507 rpm and then crept back at
about 10 rpm a second. That is 3.6% under target. The board feeds a ball only
once both wheels have held within 3% for six revolutions, which is 684 ms at
526 rpm. At 25.2 s one reading of 511 rpm completed that hold. The board's
"settling" flag cleared and the Pi sent FEED. The next reading was 509, so the
gate reset and the ball stayed queued.

The wheel was back in the band at 25.9 s and held it. The stroke started at
26.6 s and takes 0.9 s, so the ball would have gone at about 27.5 s. The Pi
gave up at 27.2 s, exactly 2.0 s after the FEED, and latched the e-stop.

**Who was wrong.** The firmware wasn't. It waits because a ball fed on a
slipping wheel lands short. The 2 s timeout was sized for the stroke plus a
margin. Nobody had sized it for a gate that re-checks a slow wheel after the
Pi has already fed, and at 526 rpm that re-check alone takes 0.68 s.

**The fix.** The Pi now starts its 2 s count from the last telemetry frame
that shows the gate shut, so it waits as long as the board is still checking.
A shut gate can stretch the wait by 10 s at most, so a wheel that never
settles still stops the drill. A lost FEED frame on an open gate still aborts
after 2 s, as before. Two new tests hold the gate shut for 1.5 s and for 30 s.
On the old code the 1.5 s test aborts. On the new code it finishes, and the
30 s test aborts at the cap.

On the simulator, the build that always aborted now runs all 30 shots. Shot 2
goes 2.3 s after its FEED.

**What is left.** The undershoot is still there. A 0.8 s wheel braking to
526 rpm under the speed-scaled gains settles 3 to 4% low and takes about 2 s
to recover. The gate waits it out, so the cost is time, not accuracy. It is
the next item on the list. All of this runs on the simulator's first-order
wheel, and a real wheel may undershoot differently.

The trace, the script and the change are in `ventures/open-tennis-robots`
(firmware/esp32/README.md, "The slow drill's release timeout").
