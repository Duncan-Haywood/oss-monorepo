---
title: "Tennis feeder: a survey twice as long finds half again as many short contacts"
seo_title: "Tennis feeder: a longer survey finds more short ball contacts"
date: 2026-11-20
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Feeding the calibration drill twice gave 1.7 times the informative balls. Simulated short contacts named rose from 17 to 26 of 36, with no false alarms."
---

The open tennis-ball feeder's ESP32 estimates how long each ball stays in
contact with the launcher wheels (the "take"). Contacts shorter than one
wheel revolution only show on the few balls whose contact falls across a
revolution's edge. Those "straddling" balls vote, and the Pi advises a
1.5 ms take when the "for" votes lead by 2.

Yesterday's runs tried three smarter vote thresholds and none of them
helped. The reason was the same each time: the twelve-shot calibration
drill gives a short-contact build one or two straddling balls, often none.
No threshold can count votes that never arrive.

## The test

So we changed the drill, not the rule. `drill.survey-long.json` is the
calibration drill's twelve shots fed twice. Before capturing anything, we
committed a prediction and a pass mark: the long drill had to name at least
1.5 times as many 1.3-2.1 ms contacts as the standard drill, no fewer longer
ones, and give no instant-contact build a false alarm. We then simulated the
same 96 builds (fresh seeds, three launchers, a jittery tach) on both drills.

| | 12 shots | 24 shots |
| --- | --- | --- |
| balls the survey scored | 22 | 46 |
| straddling balls, 1.3-2.1 ms builds | 1.58 | 2.72 |
| 1.3-2.1 ms contacts named | 17 of 36 | 26 of 36 |
| 2.4-2.8 ms contacts named | 24 of 24 | 24 of 24 |
| instant builds told to set a take | 0 of 36 | 0 of 36 |

Every clause held, the 1.5x one by a single build (26 against 25.5). On the
same builds the long drill named nine short contacts the standard drill
missed and lost none. Most of the gain is at 1.6 ms (6 to 11 of 12) and
2.0 ms (9 to 11). At 1.3 ms it only went from 2 to 4 of 12.

## What it costs

Twice the balls and about 294 s of feeding against 141 s. Straddles grew
1.7 times for 2.1 times the scored balls. A partial 36-shot run reached
3.3 straddles per build, so longer drills keep helping, but by less each
time. We did not recommend that one because its instant-contact set was
never captured.

## What changed

The README now suggests `tennisbots run drill.survey-long.json` when the
standard survey says `TAKE_US = 0` but you suspect a short contact. The
firmware and the Pi's rules are unchanged.

This is all simulated, with one wheel lag and one tach model. A real ball
wears over 24 shots, which the simulator does not model. Numbers and
captures: `ventures/open-tennis-robots/eval/take-straddle-count-2026-11-20.md`.
