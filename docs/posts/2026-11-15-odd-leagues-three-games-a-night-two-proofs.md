---
title: "Odd leagues, three games a night: a solver for most sizes, and two it proved cannot work"
seo_title: "Back-to-back games for odd-sized leagues: designs and proofs"
date: 2026-11-15
tags: [ventures, league-schedule-generator, algorithms]
description: "11 to 25 team leagues now get three back-to-back games a night on the fewest courts. 7 and 9 teams on two courts cannot: a solver and a count prove it."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
can put several games on one night, and organisers care about one thing more than
anything else: no team should sit around between its games. With three games a
night on six time slots, even-sized leagues already had schedules built for this,
written by a SAT solver earlier today. Odd-sized leagues didn't. An 11-team league
on three courts still had 16 to 22 empty slots between someone's games over a
season, and 13 teams had 52.

**Why odd is different.** With an odd number of teams, one team sits out each
round. On a night of three rounds, three teams play only two games and everyone
else plays three. The even-league trick, splitting the night into closed groups
that only play each other, breaks: a team that sits out the middle round of its
group has a gap right in the middle of its night.

**So the solver lays out the night as well.** Instead of asking for groups, the new
model (`eval/odd-night-sat.py`) gives every match a time slot directly: at most one
match per court per slot, no team in two places at once, and each team's slots in
a row. It asks that of the whole season at once.

At first that was too slow. Nine and thirteen teams ran for more than half an hour
without an answer. What fixed it was counting. When every slot on the night is
booked (13 teams on 3 courts x 6 times have 18 matches for 18 slots), every time
slot holds exactly six teams. Write down where each team's run of games can start
and the counts leave only one possibility: half the three-game teams play slots 1
to 3, the other half 4 to 6, and the three two-game teams take 1-2, 3-4 and 5-6.
Giving the solver that shape as an extra rule doesn't change the answer, it just
saves the solver from working it out over and over. Thirteen teams then took 4
seconds, 19 teams about a minute, 25 teams 78 seconds.

**Two sizes can't be done, and now the page says so.** Seven teams on two courts
came back unsatisfiable in a fraction of a second: every possible seven-team
season has at least one wait. For nine teams on two courts the forced shape makes
each night two groups of four, each playing all but one of its six pairs, linked
through one team. A short script lists all 45,360 nights of that shape, fixes the
first one, and finds 56 possible second nights and no third. So there is no such
season at all, and the solver agrees. Before, the page told those organisers
"more courts or fewer time slots close them". Now it says they need three courts,
and that every season on two courts was checked.

**One snag inside the tool.** The schedules are stored compactly and relabelled per
seed, and the tool then lays each night out with its own quick search. On the
fully booked 21- and 25-team nights that search sometimes ran out of steps before
it found the layout the solver already had. So each stored schedule now carries
the solver's layout too. The tool uses it only when its own search comes up empty,
and only after checking that it really puts every team's games back to back.

**Results**, three seeds each, every season valid, on the fewest courts at six time
slots. Waits over a season with the plain search, then now:

| Teams | Courts | Before | Now |
|---|---|---|---|
| 11 | 3 | 22 | 0 |
| 13 | 3 | 52 | 0 |
| 15 | 4 | 53 | 0 |
| 17 | 4 | 86 | 0 |
| 19 | 5 | 89 | 0 |
| 21 | 5 | 148 | 0 |
| 23 | 6 | 125 | 0 |
| 25 | 6 | 217 | 0 |
| 27 | 7 | 201 | 201 |
| 29 | 7 | 293 | 0 |

Twenty-seven teams is the one gap: its solver run passed 25 minutes, where 23 and 29
took five and six. A build with a stored schedule takes 0.1 to 1 second.

The details, the encoding and every timing are in the
[README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator#odd-leagues-three-games-a-night-solved-with-the-layout-and-two-proofs-2026-11-15-later).
Still open: odd leagues with three sessions a night (nine slots), and whether the
forced shape can be turned into a construction for every size, with no solver run
at all.
