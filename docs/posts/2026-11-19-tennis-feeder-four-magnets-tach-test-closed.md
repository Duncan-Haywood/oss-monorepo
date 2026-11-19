---
title: "Four magnets on the tennis feeder's wheel: a pre-registered test that closed the idea"
seo_title: "Tennis feeder: four tach magnets tested and closed"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "More tach pulses a revolution looked like the fix for short ball contacts. On 256 simulated balls it missed its own bar, and made the instant-take drop worse."
---

The open tennis-ball feeder's ESP32 times each launcher wheel with one magnet
and one Hall sensor: one pulse a revolution. From those pulse times it fits
how much each ball slowed the wheel, and how long the ball stayed in contact
(the "take"). This morning's run found why takes under about 2.5 ms read as
instant. A contact shorter than a revolution changes the fit only when it
happens to straddle a pulse, and most balls don't.

The obvious fix is more magnets. Four magnets put an edge every quarter turn.
So should four times as many balls see a short contact?

## Asking without touching the board

The board's fit now takes the number of pulses a revolution and each pulse's
share of the turn. Magnets glued into a printed hub are never exactly 90
degrees apart, so the shares are learnt from a steady stretch before the
ball. Each period is compared with the mean of the revolution ending with it
and the one starting with it, which stays exact while the wheel is still
speeding up or slowing down.

Then a paired simulation. One wheel, the firmware's own speed loop, a
half-sine contact, four magnets each placed with a 0.5 degree error. Every
ball is refitted with one, two and four magnets, so the control loop is the
same and only the tach differs. The 256 balls cover four speeds, two wheel
lags, eight contact times and four phases. The bar was written and committed
before the main run: four magnets must "see" twice as many short-contact
balls as one, or give a tighter bound that holds 95% of the time. Instant
balls must also not get worse.

## What happened

| | one magnet | four magnets, learnt spacing | four, spacing assumed even |
| --- | --- | --- | --- |
| short contacts seen (1-2.5 ms) | 38 of 128 | 46 | 1 |
| ball's best fit within 0.5 ms of the truth | 51 of 224 | 116 | 27 |
| instant balls read as longer than 0.5 ms | 16 of 32 | 7 | 22 |
| drop error with the take assumed instant | 0.11% | 0.55% | 1.79% |

Forty-six is not seventy-six, and the bound held on 81% of balls, not 95%.
By the rule the idea is closed, and the board keeps one pulse a revolution.

Two things came out that the rule didn't ask about. First, uneven magnets
have to be learnt. Assumed even, a 0.5 degree error puts 1,500 to 3,200 parts
per million of misfit into every period. That is two orders of magnitude more
than the signal from the contact. Second, there is a cost nobody had named.
With short periods the fit sees the contact's shape, so the default "instant"
model misfits more, and the drop it reads gets five times worse (1.12% at
6,500 rpm). More magnets only pay if the contact time is surveyed before
every drill.

Two side runs came after the verdict and carry no rule of their own. A
2 degree placement error changed almost nothing once the spacing was learnt.
Half a microsecond of sensor jitter did change things. It blinds the single
magnet (9 short-contact balls seen, no useful bound), while four magnets
still saw 24 and bounded short contacts at a median of 3.5 ms, holding on 98%
of balls. Most home builds will have the jittery kind of tach, so that is
where a second test should start.

More magnets did help the longer contacts and each ball's own best fit
(116 against 51). That could be worth a fresh test at the level the board
actually decides on, a survey summed over about 22 wheels, with its bar set
first. The fit and the spacing learner are in the firmware, ready for it.

Everything is simulated: a first-order wheel, an assumed contact profile and
point magnets. The numbers, script and rows are in the
[venture's eval note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/open-tennis-robots/eval/tach-pulses-2026-11-19.md).
