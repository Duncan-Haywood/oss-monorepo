---
title: "How much tach noise the tennis feeder's contact-time survey can take"
seo_title: "Tennis feeder: tach jitter limit for the contact-time survey"
date: 2026-11-18
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "On 144 simulated drills the feeder's contact-time survey faded at half a microsecond of tach jitter and was blind from 1.5 us. A new command reads a real tach."
---

The open tennis-ball feeder's ESP32 times each launcher-wheel revolution with a
once-per-revolution sensor. Each ball takes a little speed out of the wheels,
and the board fits that drop to learn how hard the launcher really throws. A
ball stays in the wheels for a few milliseconds, though, not an instant. So a
calibration drill also runs a *contact-time survey*: it refits every ball at
seven contact times and advises the builder to set `TAKE_US` only when the
best fit misses at least 40% less than the instant one.

[The last run](2026-11-18-the-tennis-feeders-drop-reading-gains-from-a-longer-look-only-when-its-tach-is-noisy.md)
found the survey blind at 3 microseconds of edge jitter and useful with
none. Nothing in between had been measured. A builder who logs their tach and
reads 1.2 us had no way to know which side they were on.

**The sweep.** `tests/take_survey_jitter.py` runs the same survey drill on one
simulated plant with its edge jitter set to 0, 0.5, 1, 1.5, 2 and 3 us. It
covers four contact profiles and three launchers, 72 drills a set, all scored
by the board's own sums and margin. The design set ran first. A
pre-registration went into the repository before the held-out set (another
wheel lag, another seed) ran.

| edge jitter | spread contacts named and advised, both sets (of 18) | instant contacts wrongly advised (of 6) |
| --- | --- | --- |
| 0 us | 14 | 0 |
| 0.5 us | 4 | 0 |
| 1 us | 1 | 0 |
| 1.5, 2 and 3 us | 0 of 54 | 0 of 18 |

All four predicted clauses held: nothing advised from 1.5 us, no rise in
advice as jitter grew, the best-to-instant share up by 0.47, and no wrong
re-flash. The survey falls off a cliff. Half a microsecond already takes away
most of its advice. What the noise removes is the margin, not the answer: the
picks stayed within 1 ms of the true contact time on 22 of 24 drills at
1.5 us. Every candidate's fit sinks into the same noise floor, so the survey
goes quiet rather than wrong. That is the behaviour you want, but it means a
"keep TAKE_US = 0" on a noisy tach says "cannot tell", not "instant".

One honest note: the pre-registered limit said the survey "speaks below about
1 us". The held-out set was harsher at 0.5 us (1 of 9 against 3 of 9), so the
bands that shipped put the edge lower. That choice was made after seeing the
held-out numbers, and the README says so.

**Measuring a real tach.** The new `tennisbots tach-jitter periods.txt` command
reads a steady wheel's logged periods and estimates the edge jitter. A wheel
that is speeding up or slowing down changes its period by itself, so the
estimate uses the periods' second differences. That is the third difference of
the edge times, which cancels a steady change of speed and has 20 times one
edge's variance when the edge errors are independent. Missed or doubled pulses
are dropped first. In the tests it recovers 0.5 to 5 us within 12% and ignores
a 300 rpm/s wander like a hand drill's. It also reads the board's
whole-microsecond clock, so a perfect sensor still reads about 0.4 us. The
command's bands are set on that scale. A small `firmware/esp32/tach_log.py`
logs the periods from the ESP32's REPL with the same hard interrupt the
firmware uses.

**What this does not show.** Everything here is simulated, with Gaussian,
independent edge errors. A real reflective sensor's errors may follow the
wheel's angle, or come in bursts from the ESC's switching on the lead. If a
real tach reads 1.35 us or more, the next step is a hardware timer capture in
place of the pin interrupt, measured with the same command. The full tables
are in the firmware README, "The take survey's jitter limit".
