---
title: "The tennis feeder's wait for slow wheels made one shot in three late"
seo_title: "A held-out test of the tennis feeder's slow-wheel rules"
date: 2026-11-17
tags: [open-tennis-robots, firmware, simulation, calibration]
description: "A held-out test kept the feeder's 1,000 rpm fit floor and found its wait for slow wheels made shots up to 1.7 s late. An opt-in fix removed the delay."
---

The open tennis-ball feeder works out its own launcher from the speed each
wheel loses to a ball
([how that works](2026-11-16-the-tennis-feeder-already-knew-its-wheels-recovery.md)).
Slow wheels are the hard part. A wheel at 600 rpm turns only a few times
before the firmware has to give a verdict, so two rules protect the fit. The
launcher fit ignores any wheel under 1,000 rpm. And after a slow shot the
Raspberry Pi holds back the next shot's speeds for up to 1.45 s, so the
board can keep watching the slow wheel recover.

Yesterday's work left two questions open. Is the 1,000 rpm floor still needed
now that slow wheels read their drop well? And does the wait make shots late?
Every earlier number had come from the builds the rules were tuned on, so this
run made a held-out set: launchers, wheel lags, wheel free speeds, sensor noise,
an ESC lag and slow-shot speeds that no earlier sweep had used. The rule for
dropping the floor was committed to the repository before the sweep ran.

**The floor stays.** On 18 simulated builds the slow wheels read their drop
to within 1.4% (0 of 180 more than 2% off). But adding them to the fit helped
on one plant and hurt on another. Pooled, the spin efficiency was 0.57% off
with no floor and 0.56% with it. Behind a 50 ms ESC lag the worst build
went from 1.47% to 2.33%. The pre-registered rule said keep it, so it stays.

**The wait did make shots late.** Most shots were not affected. A slow shot
followed by the same slow shot lost nothing, because the wheels did not need
to change speed. But when the next shot needed a fast wheel, it could not
start spinning up until the wait was over. With the drill's 3 s interval that
shot came 0.63 s late on average (worst 1.30 s); at a 2 s interval it was
0.88 s (worst 1.70 s). That was 141 of 144 such shots. For a player in a
rhythm drill, that is a ball arriving out of time.

**The fix: let the board keep watching through the change.** The board had
stopped watching when the speeds changed because the new speed's pulses are
not the ball's. But the board's fit already models the wheel as following
every command the board sent. A speed change is just more commands. So a new
firmware setting, `LOOP_THROUGH_CHANGE`, keeps logging the slow wheel through
the next shot's speed change (not through a stop, since a coast-down follows
the ESC's braking rather than any command), and the Pi stops waiting. On the
same held-out builds:

- No shot was later than with no wait at all (0 of 468), and the drill went
  from 117 s back to 112 s.
- Slow wheels read as before, and the spin error fell on two plants: from
  0.58% to 0.09% (mean) on the plain wheel, and from 0.53% to 0.17% behind
  the ESC lag.
- With the noisy tachometer it was worse: five more fast wheels were past 2%,
  and the worst build's spin error rose from 1.26% to 2.16%.

**Why it ships switched off.** The simulated wheel *is* a lag of its command,
which is exactly what the fit assumes, so fitting across a fivefold speed
change is the best case. A real ESC with its own speed control, a current
limit while it spins up, or a slipping belt would leave a shape the fit
lacks, and that would bias the drop of every slow ball before a fast one. The
setting should go on once a real wheel's log shows the fit holds across a
speed change. No feeder has been built yet.

The sweep, its output and the decision rule are in
[`ventures/open-tennis-robots`](../../ventures/open-tennis-robots/firmware/esp32/README.md),
under "The fit floor on held-out builds". MIT licensed.
