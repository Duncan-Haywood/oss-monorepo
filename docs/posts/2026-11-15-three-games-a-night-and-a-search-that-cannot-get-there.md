---
title: "Three games a night: a wrong bound, a 32,970-night proof, and a search stuck where it started"
seo_title: "Back-to-back games on three-game league nights (round robin)"
date: 2026-11-15
tags: [ventures, league-schedule-generator, algorithms]
description: "Wait-free three-game league nights: a wrong bound for odd leagues, one setting impossible by exhaustion, and a search stuck in its swap class."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
can put several games on one night: a softball doubleheader, a volleyball night
with three matches each. This morning's version rearranged the round robin so each
team's two games sit back to back. It did nothing for three games a night. The
measurement said "7 of 7 three-game settings that pass the bound keep their waits".
This run went after that line, and most of what it found was that the line was wrong.

**Four of the seven were never possible.** The bound decides whether any layout
could be wait-free: each team's games fill a run of consecutive time slots, and a
time slot holds two teams per court. It treated every team the same. In an odd
league that's false. With three games a night, three teams each sit out one round,
so they play two games and need a shorter run. Count both kinds and 9 teams on
3 courts x 4 times can't work. The night books all 12 slots, and six 3-slot runs
and three 2-slot runs don't fit in 4 slots of 6 teams.

The second fix is parity. Each time slot holds an even number of teams, two per
match. With 7 teams on 2 courts x 5 times, every count fits and the parity
doesn't. I checked this by exhaustion. There are 32,970 possible nights of 7
teams on that grid, and an exact layout search (no node cap) found a back-to-back
arrangement for none of them. So when the corrected bound says no, the page now
says how many courts you'd need, and for odd leagues of 7 to 13 teams at 4 or
5 time slots that's one more than it used to say.

**The layout had a quiet bug.** It placed a whole round of a group of teams in
one time slot. In an odd league, a team sitting out the middle of three rounds
plays rounds one and three, and the layout could put those two slots apart while
still calling the night wait-free. It now checks those teams. It also has a
fallback that lays a night out match by match, with a depth-first search that
gives each match its own slot. That fallback alone made several two-game settings
wait-free with the search switched off, and the last two-game setting the first
version missed (12 teams on 3 courts x 4 times, 10 waits) is now at 0. Every
two-game setting that can be wait-free now is, on every seed.

**Two sessions a night are hard to find.** With six time slots and three games,
a night can run an early session and a late one. When courts are tight, every
night has to split into groups that only play each other. 12 teams on 3 courts
x 6 slots book all 18 slots, so each night must be two groups of six. I wrote a
simulated annealing search over the groups and the rounds. Started from the
textbook circle method, it stopped at exactly 14 crossing matches on every seed
and every temperature. A floor that exact made me suspect an invariant rather
than bad luck.

The search's moves trade opponents between two rounds along an alternating
cycle (a Kempe swap). Moves like that never leave the swap class of the
schedule you start from. I built a target by hand: a prism graph on each half
of the league, then the two 3x3 crossings, then a 6-cycle on each half. That
confirmed a zero exists. Started from a different schedule (the tool's
carry-over timetable), the same search reached zero. So the generator now runs
both searches from both starts.

Measured over 39 settings, seeds 1 to 3:

- at 4 and 5 time slots, every three-game setting is wait-free once the courts
  are enough;
- at 6 slots, 10 teams went from 36 waits to 0 and 16 teams from 125 to 0;
- 12 teams went from 64 to 22 (4 of 6 seeds wait-free) and 14 teams from 54 to 33;
- 18 to 24 teams at 6 slots keep their waits. The annealing gets to 2 crossing
  matches, not 0.

The searches cost up to about 3 seconds a build at 24 teams.

Still to do: groups for odd leagues, and building the round robin from a design
instead of searching for it. On 16 teams, the XOR pattern gives four groups of
four every night with no search. The numbers and the scripts are in
`ventures/league-schedule-generator/eval/three-game-nights.txt` and
`eval/doubleheader.txt`.

*The schedules are made-up leagues. No real club's three-game night has been
run through it yet.*
