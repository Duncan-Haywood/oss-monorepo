---
title: "The tennis feeder's contact-time survey stops counting the balls that cannot see the contact"
seo_title: "Tennis feeder: the survey stops counting blind balls"
date: 2026-11-18
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Most balls fit every contact time alike and only dilute the verdict. Leaving them out doubled the named contacts on the default tach in a pre-registered test."
---

The open tennis-ball feeder's ESP32 estimates how long each ball stays in
contact with the launcher wheels. To do that it refits each wheel's speed drop
at seven assumed contact times (0 to 8 ms), adds up each candidate's misfit over
the wheels, and tells the builder whether to re-flash `TAKE_US`. It gives that
advice only when the best candidate fits clearly better than the instant step:
its mean misfit has to be at most 0.6 of the step's.

[The last run](2026-11-18-the-tennis-feeders-contact-survey-was-trimming-its-only-witnesses.md)
found why that verdict was so often silent. A revolution of the wheel lasts 10 to
27 ms, longer than any contact. When a ball's whole contact lands inside one
revolution, every candidate fits exactly as well as the step. Only the few balls
whose contact straddles a revolution's edge can tell the candidates apart.

## Wheels that cannot move the pick

A wheel that fits every candidate alike adds the same amount to every
candidate's sum. It can't change which candidate wins. What it does is drag the
best-to-step ratio toward 1, and that is the number the advice is gated on. A
drill with twenty blind wheels and three informative ones reads as "no clear
winner" even when the three agree.

The board can't cheaply work out from the tach edges which balls straddle, but
each wheel's own row already shows it. So the take survey now leaves out a wheel
when its worst candidate's squared misfit is within 1.5 times its best. It needs
no extra memory and costs one min and one max per wheel. A wheel it leaves out
still counts toward the Pi's wait. If every wheel so far is blind, the Pi says
so and tells the builder to keep `TAKE_US`. It doesn't guess.

## Chosen on old data, tested on new

The value 1.5 was picked by rescoring the board's own rows from all ten stored
capture sets (`tests/take_survey_blind.py`). Every one of those sets had been
seen before, so their numbers count as design: spread contacts named and advised
went from 330 to 398, and the one wrongly advised instant build went away. Then
the rule was written down and committed, and two fresh sets were simulated at a
lag and seed never run before:

| fresh set, 72 drills | named and advised (of 54) | instant builds advised |
| --- | --- | --- |
| hardware-timed capture, 1/8 us | 54, then 54 | 0, then 0 |
| jittery tach (the board's default) | 12, then 26 | 0, then 0 |

Every clause held, so the filter ships on. The hardware-capture set was already
at its ceiling and could only show the filter doing no harm. The gain is on the
tach the board actually runs today, and it comes at 0.5 to 1 us of edge jitter.
From 1.5 us of jitter upward the survey is still nearly blind, naming 1 of 9.

## What this does not show

All of this comes from the simulator's first-order wheel, one seed per set, with
an assumed contact profile. A real wheel's blind rows won't tie as exactly, so
1.5 may need retuning on a board. A verdict now also rests on fewer wheels: the
jittery set left out 1,149 of 1,584. The 16-wheel minimum before advising still
counts all of them, and making it count only the kept wheels is the next item.
Details are in the firmware README, "The take survey skips take-blind wheels", and
in `eval/take-survey-blind-2026-11-18.md`.
