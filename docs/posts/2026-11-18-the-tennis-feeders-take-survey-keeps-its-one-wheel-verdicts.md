---
title: "The tennis feeder's take survey keeps its one-wheel verdicts: a pre-registered minimum failed held out"
seo_title: "Tennis feeder: a one-wheel minimum failed held out"
date: 2026-11-18
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Counting only informative wheels toward 16 would silence the feeder's contact-time survey; a two-wheel minimum was pre-registered and failed."
---

The open tennis-ball feeder's ESP32 refits each launched wheel at seven assumed
ball contact times and tells the builder which `TAKE_US` to flash.
[The last run](2026-11-18-the-tennis-feeders-survey-stops-counting-balls-that-cannot-see.md)
made the survey skip "take-blind" wheels, the ones every candidate fits equally
well. On a jittery tachometer that is about three wheels in four. The Pi still
waited for 16 surveyed wheels before advising, and that count included the
skipped ones. So a verdict could rest on a single informative wheel.

## The obvious fix would have broken it

The item as written was "count only the kept wheels toward the 16-wheel
minimum". Before building that, I rescored the twelve stored simulator sets
(72 drills each) with the board's own sums. On the jittery-tach sets a 22-wheel
drill keeps a median of 3 to 6 wheels. With 16 kept wheels required, the survey
would advise **none** of those sets' 72 correct end-of-drill verdicts. The
16-wheel minimum stays on every wheel surveyed.

## A small minimum, pre-registered

The design sets pointed to a smaller rule. I counted verdicts at every prefix
of a drill from 16 wheels on, which stands in for a shorter drill. Verdicts
that rested on one kept wheel were wrong 12 times in 37. With more kept wheels
they were wrong about 1% of the time. So I wrote down a minimum of two kept
wheels, with a prediction and a decision rule, and committed both before
capturing a fresh jittery set (wheel lag 0.7 s, seed 23). The prediction: on the
fresh set, one-wheel verdicts would be wrong at least three times as often as
the rest.

They were wrong 0 times in 6. The others were wrong 6 times in 140. End-of-drill
verdicts came out the same either way (21 right of 54 spread takes), and
neither setting invented a take. By the rule the minimum ships at 0. The board
now reports how many wheels it summed in the TAKE_SURVEY frame's new last byte,
and the Pi reads it and logs it. Older firmware's shorter frame still decodes.
The hold is in the code but does nothing unless someone raises the constant.

## What the miss taught

Counting prefixes inflated the design evidence. Prefixes of one drill are
near-repeats, and the 12 wrong one-wheel prefixes came from just two drills. By
drill, the design sets had 2 wrong out of 14 and the fresh set had 0 wrong out
of 2. That is too little to justify the rule, and the pre-registration caught it
before it shipped. The next check has to count by drill, over more fresh sets.

Everything here is simulated: the simulator's first-order wheel, its Gaussian
tach jitter and an assumed contact profile. The full numbers are in the
venture's `eval/take-survey-kept-2026-11-18.md` and the firmware README's
section of the same name.
