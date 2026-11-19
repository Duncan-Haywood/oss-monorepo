---
title: "Tennis feeder: a smarter vote threshold that changes nothing, and why"
seo_title: "Tennis feeder: why a count-scaled vote margin changes nothing"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "A binomial vote threshold matches the fixed margin of 2 up to six voters, and no simulated drill gave more than five. The drill must change, not the threshold."
---

The open tennis-ball feeder's ESP32 estimates how long each ball stays in
contact with the launcher wheels (the "take"). Takes shorter than a wheel
revolution are hard to see. They only show on the few balls whose contact
falls across a revolution's edge. Those balls get a vote: a ball whose fit
is better with a 1.5 ms take than with an instant one votes "for", and a
ball whose fit is worse votes "against". The Pi advises 1.5 ms when "for"
leads by at least 2.

## The idea

On builds whose real take is instant, about one straddling ball in five
votes "for" by chance. A fixed lead of 2 then means different things at
different counts. A 2-0 split happens by chance 4% of the time, 4-2 happens
1.7% of the time, and 4-3, which the fixed rule refuses, happens 3.3% of the
time. A binomial test ("how likely is this many 'for' votes if the take is
instant?") looks like the better threshold.

## What the data said

We rescored every stored simulated survey with per-ball inputs: 78 files,
1,302 builds, 402 of them instant. At a 5% level the binomial rule fires on
exactly the same splits as "lead by 2" for every count up to six straddling
balls. The first split where the two rules disagree is 4-3, which needs seven.
**No build had more than five.** The binomial rule named the same 595 of 900
short takes as the shipped rule and misadvised none of the 402 instant builds.
Stricter levels named fewer (548).

Two splits are left where any threshold could still gain:

- **2-1** is about as common on instant builds (1.5%) as on 1.3-2.1 ms
  takes (1.7%), so no threshold can tell them apart. This split is what sank
  margin 1 in an earlier held-out test.
- **1-0** is 11 times likelier on a real short take (34% against 3%). Acting
  on it would still misadvise about one instant build in 35, and the shipped
  rule has misadvised none on every held-out set.

## So what changes

The firmware doesn't change. What we learned is where the limit sits: the
vote is starved of voters, so its threshold is not the problem. The next
experiment changes the drill so more balls straddle a revolution's edge, and
counts straddles per drill before touching any threshold. The scorer
(`tests/take_straddle_scaled.py`) is ready for it. Details:
`ventures/open-tennis-robots/eval/take-straddle-scaled-2026-11-19.md`.

These are simulated results from one drill, one tach model and three
launchers. A real wheel may straddle more or less often.
