---
title: "Solve one night, get the season: wait-free schedules for 21, 23 and 27 team leagues"
seo_title: "Back-to-back games for odd leagues: solve one night"
date: 2026-11-15
tags: [ventures, league-schedule-generator, algorithms]
description: "A whole-season solver timed out on odd leagues of 19 teams and up. Solving one night of a rotational round robin found 21, 23 and 27 team seasons instead."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
can plan three games a night so that no team waits between its games. For odd
leagues it stores seasons a SAT solver found. Each one is a round robin plus a time
slot for every match, with each team's slots in a row. At nine time slots those
runs stalled at 19 teams and up: 21 teams on four courts ran past 20 minutes, 23
teams past 25. On the page that meant 21 teams on four courts had 102 empty slots
between someone's games over three test seasons, and 23 teams had 184.

**The trick is to stop asking for the whole season.** Take the round robin where
round r is round 0 with every team number shifted by r (mod n). Shifting all teams
by one turns any night into another night with the same shape. If the night made
of rounds 0, 1 and 2 can be laid out, so can rounds 3, 4 and 5, with the same rows
and different names. So the solver only has to lay out one night, about 30 matches
instead of a few hundred. Then a short search fits copies of that night together
to cover the season.

That gives this:

| Teams | Courts (9 slots) | Waits before (3 seasons) | Waits now | Solve |
|---|---|---|---|---|
| 21 | 4 | 102 | 0 | 0.2 s |
| 23 | 4 | 184 | 0 | 221 s (5 starters) |
| 27 | 5 | 231 | 0 | 0.3 s |

It worked at six slots too: 27 teams on seven courts, which the whole-season run
had left after 40 minutes, went from 201 waits to 0. The tenth starter tried had
one night pattern, and nine shifted copies of it make up the whole season.

The plain circle-method round robin worked at once for 21 and 27 teams. For 23 it
didn't: no night of it lays out on four courts. The circle method is one *starter*,
a way of pairing up the numbers 1 to n − 1 so that every difference turns up once,
and any starter gives a round robin with the same shifting property. The fifth
starter tried had two night patterns that lay out, and they fit together.

**Where it doesn't work.** When every slot of the night is booked (19 teams on
three courts, 25 on four), no night of any starter I tried laid out. At 19 teams
that was 42 starters and every pattern of each. The old whole-season solver can
still find one such night on its own, in 33 seconds, so a wait-free season for 19
teams on three courts isn't ruled out. What's ruled out is this shortcut, for those
starters. The same thing shows at six slots, where the fully booked 13 and 17 team
cases need the whole-season model.

So the method is good when a night has a few spare slots, and it found the stored
15 and 17 team designs again in 0.1 and 22 seconds, against 51 and 245 for the
whole-season run. The script, its measurements and what's still open are in the
[README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator#odd-leagues-one-night-at-a-time-21-and-23-teams-on-4-x-9-27-on-5-x-9-and-7-x-6-2026-11-15-latest)
and `eval/odd-cyclic.txt`.
