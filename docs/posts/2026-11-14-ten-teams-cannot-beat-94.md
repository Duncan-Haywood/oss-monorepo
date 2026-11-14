---
title: "Ten teams cannot beat 94: a plain search closed what a SAT solver could not"
seo_title: "Least carry-over of a 10-team round robin, proved"
date: 2026-11-14
tags: [ventures, league-schedule-generator, algorithms]
description: "A 150-line C branch and bound proves no 10-team round robin has non-cyclic carry-over below 94, which the league schedule generator already reaches."
---

**Carry-over** is the quieter fairness problem in a round robin. If you always
play a team straight after they have played the strongest side, you meet them
tired or rattled, and over a season that adds up. Count, for every pair of
teams (a, b), how many teams meet b in the round right after meeting a. Square
those counts and add them up: lower is fairer. In a 10-team league the floor is
80, which you would get if no pair ever repeated.

The [league schedule generator](https://marisstella.app/) searches for
timetables that get close to that floor. At 10 teams its search stops at 94,
every time. The question since 2026-11-12 was whether 94 is a weakness of the
search or the true least.

**The SAT solver got most of the way.** Two days ago a SAT encoding (CaDiCaL
through python-sat) proved that nothing at 88 or under exists. It took 22
minutes for 88. At 90 it ran for 69 minutes and gave up; at 92, 98 minutes. So
the least was 90, 92 or 94, and the site said "no 10-team round robin can go
below 90".

**A plain depth-first search did better.** `eval/carryover-bnb.c` fills the
timetable round by round. In each round the lowest unplaced team takes a
partner. Placing a match adds exactly two carry-over cells: my last opponent
followed by you, and yours followed by me. A cell that already holds c adds c to
the excess over the floor, so the search knows its running cost after every
match. It drops a branch as soon as that cost passes the bound. It drops a round
as soon as some unplaced team has no unused partner left. Relabelling teams
doesn't change the value, so the first round is fixed, and so are two choices
in the second.

That is all, and it is fast:

| Asked: value at most | Answer | Time |
|---|---|---|
| 88 | none | 34 s (SAT: 22 min) |
| 90 | none | 73 s (SAT: no answer in 69 min) |
| 92 | none | 145 s (SAT: no answer in 98 min) |
| 94 | found | 2 s |

So **94 is the least carry-over any 10-team round robin can have**. The
search was already finding it.

**Why it beat the solver.** The cost here only ever goes up as you add matches.
A solver sees that through a stack of counters (a totalizer per cell, then one
over all of them), and it learns it again on every branch. The search gets it in
a single addition. The search does have weaknesses: it uses no clause learning
and almost no lookahead. That's also why it doesn't finish at 12 teams: four
cores for 23 minutes didn't even rule out the floor. What it needs there is a
bound on how much carry-over the rounds not yet placed must add.

**The page wasn't reaching it.** Checking the page in a browser turned up a gap.
Each of the page's searches trades carry-over against back-to-back home games,
and none of them searches carry-over alone. At ten teams, "the most even
carry-over" kept 106. So the page now runs one more search, on
carry-over alone, and lets that choice pick from everything it searched. The
other choices keep exactly what they kept before. The same fix helps elsewhere: at nine teams the most even season went from 89 to 69, and at twelve from 168 to 136. The new season also joins the
list an organiser can pick from.

**What changed for an organiser.** Tick "Spread who you meet next" with ten
teams, keep "the most even carry-over", and the report now reads: "80 is the floor for this many games, but no
10-team round robin can go below 94, and this schedule reaches it; an
exhaustive search proved it." Most schedulers can't tell you that their
schedule can't be beaten. This one can, at 6, 8 and 10 teams.

What this is not: it is the non-cyclic value (last round to first round isn't
counted). We haven't checked it against published tables, because the papers
weren't reachable from the session that did the work. The search, the
timetable and the measurements are in the venture's README, "The least
carry-over at 10 teams is 94".
