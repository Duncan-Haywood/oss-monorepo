---
title: "The tennis feeder's contact-time survey was trimming away the only balls that could see the contact"
seo_title: "Tennis feeder: the survey trimmed its only informative balls"
date: 2026-11-18
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "A take inside one revolution fits like an instant one, so only balls straddling an edge count, and the outlier trim dropped them: 14 of 54 named, then 42."
---

The open tennis-ball feeder's ESP32 works out each ball's speed drop on the
launcher wheels from the times between tachometer pulses. Its contact-time
survey refits every ball at seven assumed contact times (0 to 8 ms) and tells
the builder whether to re-flash `TAKE_US`.
[The previous run](2026-11-18-the-tennis-feeders-tach-gets-a-hardware-clock.md)
gave the tach a hardware clock and then tried keeping its periods in eighths of
a microsecond. The survey got worse on held-out builds (14 of 54 spread contacts
named, against 43). The per-wheel rows showed something odd: several
candidates, 0 ms and 6 ms among them, fitted to the same residual to four
digits.

## Why the rows tie

The fit only sees a wheel through each revolution's mean speed. At the speeds
the survey runs, a revolution lasts 10 to 27 ms, longer than any candidate
contact. If a contact's whole force lands inside one revolution, that
revolution's mean comes out the same as for one instant hit at the contact's
mean time, to first order. Every later revolution sees the same thing. So the
fit can nearly always slide a candidate's contact into the ball's revolution
and match the instant step exactly.

A trace of one held-out build's 22 wheels backed this up. Of 231 spread
candidates that landed inside one revolution, 143 tied the step to 0.1%, and
the rest were off only by the search grid's own scatter. All 33 that straddled
a revolution's edge differed from it. Only four wheels of 22 could tell the
candidates apart. On those four, even the right candidate fits 10 to 20 times
worse than on the other wheels, because the board models the contact as four
equal parts and the simulator's contact is a smooth curve.

## The trim

The survey drops a wheel whose best fit is more than 5 times worse than the
median wheel's. That guard was written for the ESC-lag survey, where one badly
anchored wheel once outvoted a whole drill. With whole-microsecond periods the
median miss is 20 to 60 ppm, and the four useful wheels stay in. With
eighth-microsecond periods it drops to 3 to 5 ppm, and they fall out. Rescored
from the stored board rows, the failed set lost 101 wheels to the trim and
named 14 spread contacts. Without the trim it named 42. At whole microseconds
the trim never fired on any of the 432 stored drills.

## Held out, with one miss on the way

The first pre-registered check, on a fresh set, missed its own first clause:
those builds' wheels sat at 25 ppm even with the fine clock, so the trim
dropped nothing and the change couldn't show up either way. Under the rule,
nothing shipped. A second pre-registration, a "costs nothing" test on a third
set, held on every clause. So the contact-time survey now keeps every wheel,
and the capture tachs default to eighth-microsecond periods. Over four sets
that is 173 of 216 spread contacts named and advised, against 138 at whole
microseconds.

## What is still open

One instant contact out of 72 is still advised at the fine clock: a 3.5 ms
pick at a share of 0.57, just inside the 0.6 margin. The bigger lesson is about
the measurement itself. A drill's verdict rests on the few balls whose contact
happens to straddle a revolution's edge. The next step is a survey that scores
only those balls, or a contact model smooth enough not to need them. All of
this is simulated. No robot has been built, and the tach capture has never run
on a board.

Details: `ventures/open-tennis-robots/firmware/esp32/README.md`, "Take-blind
rows traced", and `eval/take-blind-trace-2026-11-18.txt`.
