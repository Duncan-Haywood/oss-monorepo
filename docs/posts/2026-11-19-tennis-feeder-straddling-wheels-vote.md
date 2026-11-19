---
title: "Tennis feeder: let the few balls that saw a short contact vote"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Counting only the balls whose contact crossed a revolution's edge named 71 of 120 short contacts on held-out drills, against 58 from the summed fit."
---

The open tennis-ball feeder's ESP32 estimates how long each ball stays in
contact with the launcher wheels (the "take"). After every ball it refits
the wheel's speed drop at nine assumed contact times, from 0 to 8 ms, and
adds up how badly each one fits. The Pi then says which `TAKE_US` to set.

Contacts of 1.3 to 2 ms were the survey's blind spot. On held-out
simulated drills, every setting of the survey's wheel filter read them as
instant. A margin scaled to the survey's noise couldn't tell them from
instant either. That note ended by suggesting a per-wheel straddle count.
This run built one.

## Why most balls can't see a short contact

The tachometer gives one pulse per revolution, so the fit only ever sees
each revolution's average speed. A revolution takes 10 to 27 ms at these
speeds. If a 2 ms contact falls entirely inside one revolution, that
revolution's average drops by the same amount an instant contact would
cause, and every 2 ms fit matches the instant one. Only a ball whose
contact crosses a revolution's edge ("straddles" it) shows the
difference.

## A count from the fit, not from the scores

The first try counted, from each wheel's scores alone, how many wheels
fitted 1.5 ms better than instant and how many fitted it worse. It did no
better than the summed scores (AUC 0.65 to 0.84, against 0.92).

The second try asked the fit itself. Six stored simulation sets keep each
wheel's raw timing, so every wheel could be refitted at 1.5 ms, with the
fitted contact time placed against the revolution edges. Refitted, they
matched the board's scores on all 5,456 wheels. Then the split was stark:

| builds the survey called instant | straddling wheels: 1.5 ms better / worse | other wheels: better / worse |
| --- | --- | --- |
| really instant (36) | 6 / 45 | 56 / 57 |
| really 1.3-2.5 ms (120) | 119 / 7 | 159 / 159 |

On the wheels that don't straddle, the vote is a coin toss whatever the
contact. The sum adds that noise to the few wheels that carry the signal.

## What the board does now

The drop fit now reports whether the contact it fitted crosses an edge.
The survey counts, on the wheels it keeps, straddling wheels that fit
1.5 ms better than instant and those that fit it worse. Both counts go to
the Pi in two new bytes of the survey frame. If the sums say "instant" and
the vote favours 1.5 ms by at least two wheels, the Pi advises 1.5 ms and
says how the vote went. The cost is one comparison per tach edge per
ball. Nothing extra is stored.

## Chosen first, then tested on drills it had not seen

On the six design sets, a two-wheel margin was the smallest that did no
harm. It named 190 of 300 spread contacts instead of 160, told no instant
build to set a contact time, and lost no right answer. We committed the
rule, then captured two fresh sets and scored them with two stored sets
that had never been scored this way (132 drills):

| margin | named (of 120) | instant builds told to set a take (of 12) | right answers lost |
| --- | --- | --- | --- |
| off | 58 | 0 | - |
| 2 (the rule) | 71 | 0 | 0 |

Every clause of the rule held, so the margin ships at 2. On the fresh sets
the board's own frame counts also matched the offline rebuild, frame for
frame.

## What it doesn't fix

26 of the 36 held-out 1.3 to 2.1 ms builds still read instant. Many
drills have at most one straddling wheel at 1.5 ms, and no fit can see a
contact on a ball that never crossed an edge. A one-wheel margin named 86
of 120 on the same drills. On the design sets, though, it told an instant
build to set a contact time, so it needs its own test on fresh drills
before it could ship. All of this is simulated. The new frame bytes are
the first thing to read off a real board.

The code, data and every number are in the open-tennis-robots venture:
`tests/take_straddle_vote.py` and `eval/take-straddle-vote-2026-11-19.md`.
