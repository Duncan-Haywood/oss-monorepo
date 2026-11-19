---
title: "The tennis feeder's short-contact grid passed its second test, with the rule fixed first"
seo_title: "Tennis feeder: a contact-time grid that passed its second test"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Swapping the feeder's 2 ms candidate for 1.5 and 2.5 ms put 49 of 66 held-out simulated builds within 0.5 ms against 39. It ships."
---

The open tennis-ball feeder's ESP32 estimates how long each ball stays in
contact with the launcher wheels (the "take"). It refits each ball's speed
drop at a handful of assumed contact times, sums the misfit over the balls
and picks the lowest. This morning's run found that contacts under about
2.5 ms were being read as instant: the fit could see them, but the grid of
assumed times (0, 2, 3, 4, 5, 6, 7, 8 ms) had no point where their valley
sat.

## Failed by one read, then a fresh test

A grid with 1.5 and 2.5 ms in place of 2 ms looked better on the sets it was
chosen on, so it went to a fresh simulated set (M) with a rule written first.
It won on builds within 0.5 ms (48 of 66 against 41) and on large misses
(3 against 11), but one build with an instant contact read 0.8 ms where the
old grid read 0. The rule said "no instant build moved off 0", so it failed.

That build would not have changed anything for a user: the Pi only tells a
builder to re-flash when the best candidate fits clearly better than an
instant contact, and here it did not (share 0.99 against a 0.6 bar). The
clause should have been written on that advice. But rewriting a rule after
seeing the result it failed is how a test stops meaning anything. So set M
could not count, and the grid got one more chance on a set it had never
seen, with the advice clause written down first and a note that a second
fail retires it.

## Set N

Wheel lag 0.62 s, seed 101, contact times at points M did not use: 66
simulated drills. The rule was committed to git before the capture ran.

| | old grid | new grid |
| --- | --- | --- |
| within 0.5 ms (offline refits, the rule) | 40 of 66 | 45 of 66 |
| off by more than 1 ms | 6 | 6 |
| instant builds advised a re-flash | 0 | 0 |
| long-contact checks within 0.5 ms | 16 | 16 |

Every clause held, so the firmware's grid is now 0, 1.5, 2.5, 3, 4, 5, 6,
7, 8 ms. The written prediction also said the new grid would have *fewer*
large misses. It had the same number, so that half of the prediction
failed. The rule only asked for no more, and it is reported as it came out.

Then the same set ran again with the new grid live on the simulated board:
49 of 66 within 0.5 ms against the old board's 39, and large misses 3
against 7.

## What it cost

A ninth candidate means one more refit per ball. The Pi waits at most 12 s
per ball for the board's surveys, and with nine candidates the unit test's
drill hit that cap and cut its surveys short. The cap is now 14 s. On set N
a 12-ball calibration drill held its balls 140 s against 127 s (+10%), and
no survey was cut. The survey frame grew by two bytes. The Pi still reads
frames from boards running either older grid.

## Not known

All of this is simulated. Nobody has measured how long a real ball stays in
contact with a real launcher wheel, so it is unknown whether real contacts
fall under 3 ms at all. The largest misses left are 1.4 to 1.9 ms contacts
read as 0. Everything, including the rule commit, is in the repository:
[the report](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/open-tennis-robots/eval/take-short-n-2026-11-19.md)
and the project page at
[marisstella.app/open-tennis-robots](https://marisstella.app/open-tennis-robots/).
