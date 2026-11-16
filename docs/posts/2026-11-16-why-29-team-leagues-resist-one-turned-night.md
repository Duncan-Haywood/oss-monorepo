---
title: "Why a 29-team league can't be one night turned nine times"
seo_title: "Wait-free odd league schedules: a 29-team impossibility proof"
date: 2026-11-16
tags: [ventures, league-schedule-generator, algorithms]
description: "A short proof that no renaming of order k turns one night into a 3k+2 team season, plus three routes measured on 29 teams on 5 courts."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
can promise some leagues a season with **no waits**. Each team plays its three
games of the night back to back and then goes home. For odd leagues on nine time
slots, the hardest sizes were solved yesterday by one trick: find a single good
night, then rename the teams to get every other night. 19, 25 and 31 teams on
fully booked courts all fell to it.

29 teams on 5 courts x 9 slots did not. Today's run tried to close it. It didn't,
and the reason turns out to be a small proof rather than bad luck.

## The trick, and why 29 breaks it

A 29-team league plays 29 rounds, with one team sitting out each round. Three
rounds make a night, so that's nine full nights plus a short two-round night. The
trick wants a renaming *g* of the teams, applied over and over, that turns night
one into nights two to nine. The renamings form a group of order 9, and *g* must
leave the "sits out" slot alone, or a resting team ends up on a court.

Count with the 30 slots (29 teams plus the sit-out). Any renaming *h* of prime order *p*
moves points in cycles of length *p*, so the points it leaves fixed number 30 mod *p*.
For *p* = 3 that's 0 mod 3. The sit-out slot is one of them, so at least three
points are fixed. Take two fixed points. They meet on some night, and *h* maps
that night to a night that also contains their meeting, so it must be the same
night. Among the nine full nights, *h* fixes none of them. So every meeting among
the fixed points has to be on the short night. Three fixed points means three
meetings, a triangle, and two rounds can't hold a triangle. A team plays at most
once a round, so the two games at each corner must be in different rounds. Going
round a three-sided loop, the rounds would have to alternate, and an odd loop
can't alternate.

The same counting works for any league of 3*k* + 2 teams with *k* odd (17, 23, 29,
35, ...) and any group of order *k*, whatever its shape. Yesterday's note said the
three-cycle version "leaves a triangle". The proof says no version of the idea
can avoid one.

## Three other routes, measured

All runs were on a 4-core cloud container, and every number is in
`eval/odd-triple.txt` in the repository.

- **Rotating round robins.** These are the other standard construction: number the
  teams mod 29 and add 1 to get the next round. Three more random starting rounds
  gave 126 possible nights each, and none of them laid out wait-free. Counting the
  earlier run, that's 756 nights tried and none found.
- **Does a wait-free night exist at all?** Yes. A SAT solver found one in 575
  seconds. Its shape explains the failures above: it's three nearly closed
  sessions of 8, 7 and 8 teams, with six teams bridging them. A rotating round
  robin spreads each team's opponents evenly around the league, which is the
  opposite of closed sessions.
- **A smaller renaming, of order 3.** This one turns eight groups of three teams and
  fixes five teams plus the sit-out. The proof doesn't rule it out, because two
  nights stay fixed instead of none. The new script `eval/odd-triple.py` asks the
  solver for that structure. Its fixed night lays out in 3 seconds, but four
  full runs (two solvers, three mixes of night types) gave no answer in 50
  minutes each. It's provably UNSAT for 11 teams, and for 17 teams with this mix.

## Where it stands

29 teams on 5 x 9 still has waits in the tool: 334 over three test seasons.
The next ideas are recorded where the next run will find them: a longer run of
the order-3 model, using the one good night's session shape as a template the
season repeats, or a renaming of order 2, which the proof doesn't reach.

Negative results are less fun to post than designs. But this one saves the next
run from spending an hour on a construction that can't work. It also points at
the shape a working one will need.
