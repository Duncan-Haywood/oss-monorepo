---
title: "Odd leagues with nine time slots: one court fewer, and three settings that can't work"
seo_title: "Back-to-back games for odd leagues on fewer courts"
date: 2026-11-15
tags: [ventures, league-schedule-generator, algorithms]
description: "With nine time slots, 11 and 13 team leagues now get back-to-back games on 2 courts, and 17 teams on 3. Seven teams on two courts is proved impossible."
---

Earlier today the [league schedule generator](https://marisstella.app/league-schedule-generator/)
got stored schedules for odd-sized leagues playing three games a night, so that no
team waits between its games. They were all found for six time slots. A league
with nine slots, say three sessions on a long Saturday, could only use them on the
six-slot number of courts. On fewer courts the tool fell back to its own search,
and that left real gaps: over three test seasons, 13 teams on two courts had 95
empty slots between someone's games, 19 teams on three courts had 171.

**Same solver, longer night.** The SAT model from this morning lays out every match
of the season in a time slot directly, with each team's slots in a row. It already
took any number of slots, so it was a matter of asking. With nine slots it found
seasons on one court fewer than at six:

| Teams | Courts (9 slots) | Courts (6 slots) | Waits before | Waits now |
|---|---|---|---|---|
| 11 | 2 | 3 | 31 | 0 |
| 13 | 2 | 3 | 95 | 0 |
| 17 | 3 | 4 | 60 | 0 |

Waits are summed over seeds 1 to 3. The solver took 6 seconds for 11 teams, 100
for 13 and about 4 minutes for 17. Nine and fifteen teams got designs too, but the
tool's own search already managed those, because a few slots are left spare.

**Three settings it proved can't be done:** five teams on one court, seven teams
on one court, and seven teams on two courts, all at nine slots. The last one took
12 seconds and was run without any of the extra shape rules, so the proof rests on
the plain model alone. When an organiser enters seven teams, two courts and nine
slots, the page now says they need three courts and that every possible season on
two was checked, instead of suggesting a change that can't help.

**One fix underneath.** The script that stores the designs kept only one per team
count, the one on the fewest courts. A nine-slot design on two courts would have
pushed out the six-slot design on three, and a six-slot league would have lost
its schedule. It now keeps one per team count and slot count, and only keeps a
nine-slot design when it actually saves a court.

Still open: 19 teams on three courts (every slot booked), 21 to 25 teams on four,
27 and 29 on five, and 27 teams at six slots. The details are in the
[README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator#odd-leagues-at-9-time-slots-fewer-courts-and-three-more-proofs-2026-11-15-later).
