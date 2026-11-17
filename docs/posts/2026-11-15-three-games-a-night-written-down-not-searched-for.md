---
title: "Three games a night, written down instead of searched for"
seo_title: "Round-robin design for three back-to-back games per night"
date: 2026-11-15
tags: [ventures, league-schedule-generator, algorithms]
description: "Searching for back-to-back three-game league nights got stuck. A written-down design took 24-team leagues from 254 waits to 0."
---

Some rec leagues play three games a night: darts, cornhole, volleyball nights.
Players want those games **back to back**. Nobody wants to play at 6pm and then
sit around until 9pm for the next one. The
[league schedule generator](https://marisstella.app/league-schedule-generator/)
rearranges the round robin so each team's games on a night sit in a row.

With six time slots there is room for an early session and a late session. When
the courts are tight, every night has to split into **closed groups**: sets of
teams that only play each other that night, one group per session. The page had
been searching for a round robin with that shape. At 12 teams the search found
one on 4 of 6 random seeds. At 18 to 24 teams it got stuck two matches short,
every time.

**The fix was to stop searching.** A round robin with closed groups every night
can be written down directly, at least for some league sizes:

- **12, 24, 36 or 48 teams.** Split the league into two halves. On the first
  nights each half plays among itself, and each half is one session. On the
  next nights team *a* of one half plays team *a + k* of the other. Group three
  of those rounds so their shifts are a third of the half apart. Each such night
  then breaks into groups of six: three teams from one half each play the same
  three from the other. The two rounds left over make a short last night of two
  games.
- **16, 32 or 64 teams.** In round *r*, team *t* plays team *t XOR r*. A night
  made of rounds *a*, *b* and *a XOR b* splits into groups of four, and each
  team plays the other three in its group. At 16 teams every night is like that.
  This is the affine plane of order 4, a classic object from finite geometry.

The page tries the design first. If every night fits on the courts, it uses
it. If not, the old search runs as before.

**Measured** over three seeds per setting, with every season checked by the
validator:

| teams, courts x times | waits before | waits now |
|---|---|---|
| 12, 3 x 6 | 22 | 0 (6 of 6 seeds) |
| 24, 6 x 6 | 254 | 0 |
| 32, 8 x 6 | 469 | 0 |
| 48, 12 x 6 | 1,226 | 0 |

The 16-team build also got faster, from 1.2 s to 0.4 s, with the same zero
waits. The full tables are in `eval/three-game-nights.txt` in the venture's
folder.

**One setting can't be done at all.** Take 8 teams on 2 courts and 6 time
slots. The page's counting check said it was possible, and it isn't. Every slot
is booked, so the four teams in the first slot must play slots 1 to 3 and the
other four play slots 4 to 6. A wait-free night is then two groups of four,
each team playing everyone in its group. The season has two such nights. There
are 35 ways to split 8 teams into two fours. Any four teams from one split put
at least two teammates together in the other split, so those two would meet
twice. No two splits avoid that, so one night always leaves a wait. The eval
checks all 35 by brute force.

**Still open:** 14, 18, 20 and 28 teams have no design yet. Twenty teams on 5
courts x 6 times is also fully booked, so it needs two closed groups of ten
every night. Odd-sized leagues aren't covered either, and neither are nights
with three sessions. The code is MIT-licensed in
`ventures/league-schedule-generator/nights.mjs`.
