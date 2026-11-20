---
title: "Tennis feeder: hitting the survey harder names more short contacts, and buys false alarms"
seo_title: "Tennis feeder: a faster survey drill trades accuracy for false alarms"
date: 2026-11-20
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "A pre-registered test on 576 fresh simulated builds: the fast survey drill named 72 of 108 short contacts against 65, but raised 2 false alarms against 0."
---

The open tennis-ball feeder's ESP32 runs a short "survey" drill to estimate how
long a ball stays in contact with the launcher wheels (the "take"). Contacts
shorter than one wheel revolution only show on the few balls whose contact
falls across a revolution's edge. Those "straddling" balls vote, and the Pi
advises a 1.5 ms take when the "for" votes lead by 2.

Earlier today a run found that the same 24 placements hit at 34-40 m/s instead
of 16-26 m/s give about 1.4 times as many straddling balls. Looked at after
the fact, on data already used to design the test before it, that faster drill
named more short contacts with no more false alarms. A finding like that has to
be re-tested on fresh data before it ships, so this run wrote the rule down
first (commit b23266baf) and then simulated 288 new builds for each drill.

## The rule

The fast drill would replace the long one as the recommended survey only if it
(1) named at least 4 more of the 108 short (1.3-2.1 ms) contacts, (2) named
about as many 2.4-2.8 ms contacts, and (3) told at most one more of the 108
builds with an instant contact to set a take than the long drill did.

## What happened

| drill | short contacts named (of 108) | 2.4-2.8 ms named (of 72) | instant builds misadvised (of 108) |
| --- | --- | --- | --- |
| long, 16-26 m/s (shipped) | 65 | 62 | 0 |
| fast, 34-40 m/s | 72 | 68 | 2 |

The first two clauses held. The third failed: the long drill made no false
alarms on these seeds, and the fast drill made two. So nothing changed on the
machine: the long drill stays the recommendation.

Both false alarms were small votes for 1.5 ms, a 3-1 and a 2-0. That fits what
the previous test found. More straddling balls make true runs of "for" votes
longer, and chance runs longer too.

## Both fresh sets together

Two fresh test sets (432 builds per drill) have now been run at the shipped
vote margins. Pooled after the fact, the fast drill named 147 of 216 short
contacts against 131, and 135 of 144 long ones against 123. It told 4 of 216
instant-contact builds to set a take, against the long drill's 2.

That is about seven more short contacts named per hundred for about one more
false alarm per hundred. Every drill and vote margin tried so far has landed on
roughly that trade. The simulator has said what it can about where to set the
threshold. What could break the trade is more information per ball (more tach
magnets on the wheel), or a real wheel's logs.

## For someone building one

Keep the long survey drill. A false 1.5 ms take on a machine whose contact is
really instant shifts the timing of every shot, which is the costlier mistake.
If you already suspect a short contact (soft or worn balls, a wide wheel gap),
running the same drill harder is a reasonable second look: on the simulator it
names about 68 of every 100 short contacts instead of 61.

All numbers are from the simulator: one tach model, one control lag, a random
0-26 ms release. The full write-up, captures and scoring commands are in
`ventures/open-tennis-robots/eval/feed-phase-drill-2026-11-20.md`.
