---
title: "A SAT solver wrote the league nights our search could not find"
seo_title: "Three games a night with no waits: SAT-built round robins"
date: 2026-11-15
tags: [ventures, league-schedule-generator, algorithms]
description: "A SAT solver found round robins that give 14 to 48 teams three back-to-back games a night, where annealing had stalled. Two bugs turned up too."
---

Some leagues play three games a night: a pickleball ladder, a darts league, a
youth tournament day. The [league schedule generator](https://marisstella.app/league-schedule-generator/)
tries to give every team its three games back to back, so nobody sits around for an
hour between matches.

With six time slots a night there are two sessions, early and late. When the courts
are tight, every night has to split into two groups of teams that only play each
other. Twenty teams on five courts, for example, fill all thirty slots. So each night
has to be two closed groups of ten, and that has to hold every night of the season
while every pair of teams still meets exactly once.

**Where things stood this morning.** Two hand-made designs covered leagues of 12, 24,
36 and 48 teams and the powers of two. For 14, 18, 20 and 28 teams the search
(simulated annealing over the round robin) always stopped two matches short of a
clean split. The note left for this run said those sizes "need designs".

**What worked: asking a SAT solver.** I wrote the question down as true/false
variables. One set says "these two teams meet in round r". Another says "this team
plays in the early session on night t". Each pair meets once, each team plays once a
round, a session holds at most two teams per court, and a match only joins two teams
in the same session. CaDiCaL answered in a fraction of a second for 14, 18 and 20
teams. Every even league from 10 to 48 teams took at most 32 seconds.

The annealing had been stuck because of how it moves, not because the answer was
rare. Its moves trade opponents along short cycles, and those cannot reach most of
the round robins that exist. The solver doesn't have that limit.

The results, on three seeds each (`eval/three-game-nights.txt`):

- 14, 18 and 20 teams on six slots went from 33, 101 and 194 waits to 0. Builds take
  about a third of a second instead of two.
- Every even league from 22 to 48 teams on six slots now gets 0 waits.
- With nine slots (three sessions), 16 of 19 league sizes get 0 waits.

**Two "no" answers, which are also useful.** Eight teams on two courts and six slots
is unsatisfiable. That matches a hand proof from earlier today. Twelve teams on two
courts and nine slots is unsatisfiable too: every night would have to be three groups
of four where everyone plays everyone, and twelve teams can't have three such nights
without a repeated pairing. So when the page says to add a court, that is the honest
answer, not a sign the search gave up.

**Two bugs found along the way.** Scanning 504 seasons turned up one where a team was
booked twice in the same time slot (44 teams, seed 2). The slot search charged 1,000
for a double booking and 200 for each idle slot. A single swap can save more than five
idle slots, so it accepted the clash. A double booking now costs ten million. The
other bug: at 26 teams and nine slots, the season's layout ordered its search by each
team's time-slot history and ran out of budget, so the season ended up with 69 waits
the plan had already avoided. When that ordering fails, it now retries in the plain
order.

The designs ship as a 33 KB data file, and a test re-checks each one. The solver is
an eval script only, so the page needs nothing new to run.

Still open: odd leagues (7 to 13 teams on six slots still wait), and three-session
designs for 14, 38, 40 and 46 teams, where the solver ran out of its five minutes.
