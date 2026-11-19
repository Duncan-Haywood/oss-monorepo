---
title: "Tennis feeder: a second vote at 2.5 ms names longer short contacts"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "A straddle vote at 2.5 ms named 110 of 180 held-out contact times against 102, and told none of 90 instant builds to change."
---

The open tennis-ball feeder's ESP32 refits each launcher wheel's speed
drop at nine assumed ball contact times (the "take", 0 to 8 ms), and the
Pi turns the summed fit errors into one line: which `TAKE_US` to set.

Earlier today a [straddle vote](2026-11-19-tennis-feeder-straddling-wheels-vote.md)
fixed part of the survey's blind spot. The tach gives one pulse a
revolution, so a short contact only changes the fit when it crosses a
revolution's edge. Counting just those wheels, and asking whether 1.5 ms
fits them better than an instant contact, named many 1.3-2 ms takes the
sums had read as instant.

It didn't help takes of 2.4 to 3.5 ms that the sums also read as 0. Their
straddling wheels see a contact of the wrong length at 1.5 ms, so they
rarely vote for it.

## The same vote, one grid step up

The board already fits every wheel at 2.5 ms, so the second vote costs
no extra fit. It reads the 2.5 ms fit's own "did the contact cross an
edge" flag, counts the straddling wheels that fit 2.5 ms better or worse
than instant, and sends both counts in two more frame bytes. If the sums
say instant and either vote leads by its margin, the Pi advises that
vote's time. When both lead, the bigger lead wins, and a tie goes to
1.5 ms.

On every stored simulated set that keeps the wheels' raw inputs (636
builds), straddling wheels at 2.5 ms split like this:

| true take | for 2.5 ms | against |
| --- | --- | --- |
| instant | 13 | 172 |
| 2.4 ms and up | 337 | 23 |

A margin of 1 (one more "for" than "against") named the most takes but
told 5 of 96 instant builds to set 2.5 ms. A margin of 2 named 22 more
takes than the 1.5 ms vote alone and harmed none, so it became the
candidate.

## Held out, rule first

The prediction and the shipping rule were committed before any test set
existed. The test used six fresh standard sets and 24 instant-only
captures, 270 simulated builds in all. Under the rule, the vote shipped
only if it named more takes, told no instant build to set one, lost
fewer than one build per five it won, and the board's own counts matched
a rebuild on every frame.

| 2.5 ms margin | named (of 180) | instant builds misadvised (of 90) | won / lost |
| --- | --- | --- | --- |
| off | 102 | 0 | - |
| 1 | 128 | 3 | 27 / 4 |
| **2** | **110** | **0** | **8 / 0** |

Every clause held, so the Pi's `TAKE_STRADDLE2_MARGIN` is now 2. Margin 1
failed the instant-build test again, as it did at 1.5 ms.

## What's still missing

70 of the 180 contact times are still more than 1 ms off, most of them
1.3 to 2 ms. Those builds mostly had no straddling wheel at either time:
with one tach pulse a revolution, nothing in the fit can see a contact
that stays inside one revolution. More tach edges or more balls are the
only ways in. All of this is simulated. On a real machine, the first
reading will come from the frame's two new bytes.

The full note, with commands and stored captures, is
`ventures/open-tennis-robots/eval/take-straddle-two-2026-11-19.md`.
