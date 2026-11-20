---
title: "Tennis feeder: our simulator put every ball at the same point of the wheel's turn"
seo_title: "Tennis feeder: a simulator artefact behind our survey numbers"
date: 2026-11-20
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Which balls showed a short wheel contact was set by the drill, not by chance. With a random release the survey names 21 of 36 short contacts, not 26."
---

The open tennis-ball feeder runs a "take survey" to estimate how long
each ball stays in contact with the launcher wheels. A short contact,
1.3 to 2.1 ms, only shows up on a ball whose contact crosses the edge of
a tach revolution: the moment the wheel's one magnet passes its sensor.
The last two posts
([longer survey](2026-11-20-tennis-feeder-longer-survey-short-contacts.md),
[third pass](2026-11-20-tennis-feeder-third-survey-pass-not-worth-it.md))
counted those "straddling" balls. Their next step was a drill with
different wheel speeds, picked so that a 1.3 ms contact would land on an edge.

## What we found first

Before building that drill, we refitted every ball of the 96 stored
simulated survey builds and counted straddles by the ball's place in
the drill. If balls met the wheel at a random point of its turn, every
place would straddle now and then. They did not. 18 of 46 places
straddled on 0 of 96 builds, and a few did on 16 to 28. The pattern was
the same across seeds, launchers and contact times. The same shot on its
second pass could go from 14 straddles to 0.

The reason was in the simulator. A ball left the moment the shuttle
reached the wheels, on the millisecond, so a drill's timing fixed where
in a revolution every contact landed. A real gutter and shuttle cannot
place a ball to a tenth of a millisecond in a 10 to 25 ms revolution.
A drill tuned to land contacts on edges would have been tuned to the
simulator, not to a machine.

## The fix and the test

The simulator now has an opt-in random release: each ball is held a
further 0 to 26 ms, longer than the slowest wheel's revolution. With
the release off, every stored result comes out exactly as before.
With a random phase, a shot's chance of straddling depends on the sum of
its two wheel speeds, so the obvious lever is faster shots. We built a
fast survey drill with the same 24 targets at 34 to 40 m/s, which gives
1.43 times the summed wheel speed. Before capturing anything we committed
a pass mark: no false alarms on instant-contact builds, and at least four
more short contacts named than the shipped 24-shot drill.

| | straddling balls per short-contact build | short contacts named | instant builds told to set a take |
| --- | --- | --- | --- |
| 24-shot drill, old simulator | 2.72 | 26 of 36 | 0 of 36 |
| 24-shot drill, random release | 2.44 | 21 of 36 | 1 of 36 |
| fast drill, random release | 3.56 | 22 of 36 | 1 of 36 |

The fast drill failed: it named one more contact, not four, and it raised
one false alarm. The firmware and the Pi's rules are unchanged.

The more important row is the middle one. With a realistic release, the
survey we already ship names about 21 short contacts in 36, not 26, and it
told one instant-contact build in 36 to set a 1.5 ms contact. That came from
a 2-to-0 vote among straddling balls. The vote still separates well:
the straddling balls of instant builds voted 11 for and 79 against. But two
or three balls are too few for a margin of two.

## What is next

On the same builds, so as a lead and not a result: with a margin of three,
neither drill raised a false alarm. The 24-shot drill then named 11 short
contacts and the fast drill 18. The next run will test exactly that
pre-registered comparison on fresh seeds, and every survey capture from
now on runs with the random release.

All of this is simulated, with one wheel lag and one tach model. Numbers,
commands and captures:
`ventures/open-tennis-robots/eval/feed-phase-2026-11-20.md`.
