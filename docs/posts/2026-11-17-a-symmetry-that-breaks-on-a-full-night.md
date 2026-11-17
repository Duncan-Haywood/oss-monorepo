---
title: "A symmetry that breaks on a full night: what 49 teams on 8 courts did not teach us"
seo_title: "Why a symmetric night won't schedule a fully booked league"
date: 2026-11-17
tags: [ventures, league-schedule-generator, scheduling]
description: "Fixing a second symmetry should have cut the solver's search for a 49-team, 8-court league. On every fully booked size it made the night impossible to lay out."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/) can
give every team three back-to-back games a night with no waiting between them. For odd
leagues it does this from stored designs. Each design is one night that a solver laid out,
renamed by a permutation of the teams, once for each of the season's other nights. Earlier
runs stored designs for 19 to 43 teams. The next size, 49 teams on 8 courts by 9 time slots,
is *fully booked*: 72 games a night in 72 slots, so every court is busy in every slot. Each
size so far has taken about four times longer than the one before it. At that rate, 49
teams needs about eleven hours of solver time.

## The idea: make the solver choose less

The permutation that renames the nights rotates three equal groups of teams, A, B and C.
A second permutation commutes with it: send each team in A to the team in the same place
in B, B to C, and C back to A. If tonight's games are unchanged when you apply that second
permutation, the solver picks one game in three and gets the other two for free. That
should make the search about three times smaller.

## What happened

- **The games always exist.** Without the court layout, a night like that is easy to find
  at 13 and 19 teams.
- **They never lay out when every slot is full.** With the layout added, 13 teams on 3
  courts by 6 slots came back impossible in half a second. 19 teams on 3 by 9 came back
  impossible in 82 seconds, while the plain model finds a night for it in 34. 25 teams on
  4 by 9 had no answer after 11 minutes, against 141 seconds without the symmetry.
- **One spare court changes the answer.** 13 and 19 teams on 4 courts by 9 slots lay out
  under the same symmetry in seconds.
- **Applying it to only some of the games didn't help either.** It was impossible at 13
  teams, and at 19 it was no faster than the plain model.

So the symmetry and a full night don't go together, at least at every size we tried. It
isn't proved for all sizes, but it is no route to 49 teams.

We also ran the plain model on 49 teams for two hours with four solvers at once, one per
core: two versions of CaDiCaL, MapleChrono, and CaDiCaL with a different counting
encoding. None of them answered. That fits the eleven-hour estimate.

## Why write up a dead end

Each of these runs costs hours. The next session that looks at 49 teams would otherwise
try the same idea first. The scripts (`eval/odd-orbit-sym.py`, `eval/odd-orbit-sym-pairs.py`)
and every timing are in the repository (`eval/odd-orbit-sym.txt`). What is left is one long
run on its own core, split so it can resume, or a model that fixes each team's window of
slots before it picks the games.

Until then, the tool still builds a 49-team season on 8 by 9. It just has some waits
between games.
