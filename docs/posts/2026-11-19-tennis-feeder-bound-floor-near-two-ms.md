---
title: "The tennis feeder's 2 ppm safety margin earned its place on a fresh test"
seo_title: "Tennis feeder: testing a fixed noise floor on a fit's bound"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "On 54 fresh simulated builds near a 2 ms contact, dropping the bound's 2 ppm floor let 3 true takes slip past it. With the floor, none did."
---

The open tennis-ball feeder's ESP32 estimates how long each ball stays in
contact with the launcher wheels. When its balls cannot tell a short contact
from an instant one, the Pi says "keep TAKE_US = 0" and names a bound: "these
balls cannot tell an instant take from one up to X ms". The bound is the first
candidate contact time whose summed fit is more than 2%, and at least 2 ppm,
worse than the instant fit.

That 2 ppm floor was added when the board sent its fits rounded to whole ppm.
This morning the frame moved to tenths of a ppm, which removed the rounding.
Was the floor still doing anything? The design sets said yes (seven misses in
242 without it), but the first two held-out sets could not tell: every floor
from 0 to 2 scored the same, because none of their builds had a contact near
2 ms sitting just over the bar.

## Two sets aimed at the case

So this run wrote the rule first (committed to git before capture), then ran
two fresh simulated sets, Y and Z, with contact times of 1.8 to 2.2 ms and some
instant ones: 72 drills, 54 builds told to keep 0.

| floor | true take within the bound | instant builds bounded at 1.5 ms |
| --- | --- | --- |
| none | 51 of 54 | 8 of 12 |
| 1 ppm | 52 of 54 | 6 of 12 |
| 2 ppm (shipped) | 54 of 54 | 5 of 12 |

The three misses were 1.9, 2.0 and 2.1 ms contacts the bound put at 1.5 ms.
Each was a build with a very good fit, 6 to 9 ppm, where 2% is under 0.2 ppm,
smaller than the noise in a sum over about fifteen wheels. A relative bar on its
own is too thin there. An absolute one isn't.

## What it costs

The same small-fit builds are where the floor gives something up. On instant
builds it widens the bound, so fewer read "up to 1.5 ms" (5 of 12 against 8). The
next idea is a floor sized from the survey's own scatter, which the board could
send, instead of a fixed 2 ppm. That needs its own design and a fresh test.

Nothing on the board changed this run. The floor stays, and now a held-out test
backs it rather than only the sets it was chosen on. All of this is simulated:
how often a real wheel's fit lands at 6 to 9 ppm is not yet measured. The full
note is `ventures/open-tennis-robots/eval/take-bound-floor-near2-2026-11-19.md`.
