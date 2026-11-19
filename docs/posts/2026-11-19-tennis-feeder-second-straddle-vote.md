---
title: "Tennis feeder: a second straddle vote, at 2.5 ms, passes its held-out test"
seo_title: "Tennis feeder: a second straddle vote at 2.5 ms passes held out"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Counting straddling wheels at 2.5 ms as well as 1.5 ms named 76 of 120 short contacts on fresh drills, against 70, and misadvised no instant build."
---

The open tennis-ball feeder's ESP32 refits each ball's wheel-speed drop at
nine assumed contact times, and the Pi tells the builder which `TAKE_US`
to set. Earlier today a straddle vote shipped. It counts only the balls
whose contact crosses a tach revolution's edge, because those are the only
balls that can show a contact shorter than a revolution. That vote asks one
question: does 1.5 ms fit better than an instant contact?

It helped the 1.3 to 2 ms contacts. Longer short contacts were still often
read as instant: at the shipped margin, 20 of 36 held-out builds at 2.4 to
3.5 ms got "keep TAKE_US = 0". One 2.8 ms build was told 1.5 ms, which is
more than a millisecond off.

## The same vote, one candidate up

The board already fits every wheel at 2.5 ms, since that is the grid's
third candidate. So a second vote costs one flag per wheel and two bytes at
the end of the survey frame. No new fit is needed. On a wheel whose 2.5 ms
fit puts the contact across an edge, 2.5 ms fitting better than instant is
a vote for it.

On the fifteen stored simulation sets that keep each wheel's raw timing
(636 builds), the 2.5 ms vote turned out stricter than the 1.5 ms one:

| builds | straddling wheels at 1.5 ms: for / against | at 2.5 ms: for / against |
| --- | --- | --- |
| really instant (96) | 20 / 102 | 13 / 172 |
| really 0.1-0.9 ms (144) | 35 / 169 | 15 / 289 |
| really 2.4 ms and up (204) | 163 / 2 | 337 / 23 |

An instant build's straddling wheel votes for 2.5 ms about one time in 14
(for 1.5 ms it's one in five). No instant or sub-millisecond build ever led
by two. When the sums say instant, the Pi now reads the 2.5 ms vote first,
then the 1.5 ms one. On the design sets a two-wheel margin named 356 of 540
spread contacts instead of 333 and lost no right answer. A one-wheel margin
told 5 of 96 instant builds to set 2.5 ms, so it was never a candidate.

## Rule first, then fresh drills

Those sets had all been looked at for the first vote, so they could only
choose the rule. We committed the rule and the prediction. Then we captured
four fresh sets with new seeds, plus twelve instant-only captures, so a
rare harm would have 48 instant builds to show up in:

| 2.5 ms margin | named (of 120) | instant builds told to set a take (of 48) | right answers lost |
| --- | --- | --- | --- |
| off | 70 | 0 | - |
| 2 (the rule) | 76 | 0 | 0 |
| 1 | 85 | 2 | 3 |

Every clause held, so the vote ships at margin 2. The board's own counts
also matched the offline rebuild in every frame. Margin 1 again told
instant builds to set a contact time, so it stays closed.

## How much it buys

Not much: 6 builds of 120. 14 of the 36 fresh builds at 2.4 to 3.5 ms still
read instant. 11 of those had one straddling wheel at 2.5 ms or none. With
one tach pulse a revolution, a 22-ball drill has only a few balls whose
contact crosses an edge, and nothing the board computes can see a contact
on a ball that didn't. The bigger lever is still the tach. An earlier test
found four magnets a revolution not worth it on a clean tach, but promising
on a jittery one. All of this is simulated. The frame's two new bytes are
what a real board will report first.

The code, data and every number are in the open-tennis-robots venture:
`tests/take_straddle_vote.py --long` and `eval/take-straddle-long-2026-11-19.md`.
