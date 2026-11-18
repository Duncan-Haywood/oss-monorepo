---
title: "The tennis feeder's long ESC lags weren't unknowable: its survey only looked at 8 revolutions"
seo_title: "Long ESC lags: the tennis feeder's survey needed a longer look"
date: 2026-11-18
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Long ESC lags looked impossible to tell apart from a slow wheel. The fit was reading 8 revolutions; with 16, held-out drills all came within 15%."
---

The open tennis-ball feeder's ESP32 works out each ball's momentum from how
much its launcher wheels slow down. To do that it needs to know how long the
motor controller (the ESC) takes to follow a command, so after every ball it
refits each wheel at seven candidate lags and picks the one that fits best.
[The previous run](2026-11-18-the-tennis-feeders-esc-survey-gets-a-150-ms-point.md)
ended on a gloomy note. Above about 165 ms on a slow wheel the pick was 20-30%
off while looking sure, a check meant to flag that failed its held-out test,
and the explanation was that two lags in series are hard to tell apart.

**Noise or bias?** A confidence flag built on how much the survey's wheels
disagree can only catch noise. So the first step was to split each stored
drill in half and pick a lag from each half. The worst misses had halves
that agreed with each other on the wrong lag: a 165 ms ESC read 117 ms from
one half and 121 ms from the other. That is a bias, and no spread-based flag
would have caught it.

**Where the bias came from.** Each refit reads 4 revolutions before the
ball and 8 after. At 3,000 rpm that is about 0.16 s, while the wheel's own
lag is 0.3-0.6 s and a long ESC's 0.15-0.25 s. Over the first sixth of a
second of a recovery, two lags in series look like one. But the board's log
of each stroke already ran on to the verdict, 28 to 118 revolutions. It was
discarding most of what it had recorded.

**The test.** A new script captured 42 simulated drills with the ESC lag
hidden from the board, kept every wheel's raw inputs, and refitted them
offline reading 8, 12, 16 and 24 revolutions after the ball. Within 15% of
the true lag: 31 of 42 at 8, 41 at 12, 42 at 16 and 24. The prediction for
16 was then committed to the repository before a held-out set ran (new ESC
lags of 0-230 ms, new wheel lags, a new seed and a different launcher).
It held: 28 of 28 within 15%, against 21 for the old window, which missed
half of the drills with an ESC of 175 ms or more.

**What changed.** The board's survey now reads 16 revolutions. When the pick
lands on the grid's last point, 400 ms, the Pi no longer advises setting
400. It says the lag is long and asks the builder to measure the ESC on a
scope.

**What it costs and what isn't known.** Each refit does about 1.6 times the
arithmetic, and nobody has timed that on a real ESP32 yet. Short lags now
read slightly low (a 50 ms ESC as 44-47 ms, still within 15%). Everything
here is simulated with an ESC that behaves as one clean lag; a real ESC may
not. The details, tables and the script are in the venture's firmware
README, "Long ESC lags: the survey read too little of the recovery".
