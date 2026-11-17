---
title: "A 47-team league: from 5 wait-free nights to 13 of 16, and why a longer budget did worse"
seo_title: "47-team league schedule: 13 of 16 nights with no waits"
date: 2026-11-17
tags: [ventures, league-schedule-generator, algorithms]
description: "A neighbourhood search took a 47-team, 8-court season from 5 to 13 wait-free nights. Every failed repair ran out of time, yet 900 s repairs did worse than 300 s"
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
tries to give each team three back-to-back games a night, so nobody waits between
games. For odd leagues at nine time slots on the fewest courts, every size from 11 to
45 teams now gets that. 47 teams on 8 courts is one of the two sizes left below 50.
This morning the search had **5 of the season's 16 nights** laid out with no waits.
Now it has **13**.

## What the search does

A night is three rounds: 69 games in 72 slots (8 courts × 9 slots). The search keeps a
whole round robin and calls a night "good" when a SAT solver can lay its games out so
every team plays in consecutive slots. One step frees two nights, deals their pairs
into rounds again, and asks the solver for a deal where one more of those nights is
good. Nothing outside the two nights changes, so the season stays a round robin.

The last run saved its state to a file in the repository, and this run started from it.

## A relay, not one long run

Four searches ran at once, on four cores. Whenever one of them found a better state it
was committed straight away, and the search that had made the least progress was
restarted from it. That mattered: the container restarted once, and nothing was lost.

- Seed 71 took the state from 5 to 11 good nights in about 3.5 hours.
- After the restart, seed 103 took 11 to 12 on its first step (372 s) and to 13 at
  1,348 s.
- Seed 112, with a different setting, reached 12 on its own.

## Every failed repair ran out of time

The script used to log nothing when a repair failed, so you couldn't tell "the solver
ran out of time" from "no such deal exists". It now counts both. Over every run that
had the counter, **every failed repair was a timeout and none was proved
impossible**. At 41 teams it was the other way round: the last bad night was impossible
on its own pairs, and only re-dealing it could help.

So you would expect more time per repair to help. It didn't. A run allowed 900 seconds
per repair made one sideways move in nearly two hours and never climbed, while the
300-second runs climbed in the same time. Most climbs came a few repairs after a
*sideways* step, one that re-deals the pairs without adding a good night, so the
bad nights see new pairs. The search only tries one of those after six failures in a
row. That number is now an option, `--sideways-after`. The first test of a lower value
reached 12 good nights; one run is not a verdict.

## The short night takes the awkward pairs

The season's last night has only two rounds: 46 games in 72 slots, with room to spare.
Both of seed 103's climbs freed that night together with a bad one, so the short
night's spare slots took the pairs the bad night could not fit. That is the same move
that closed 41 teams two days ago. Now it has an option of its own (`--also 15`) and
two wins.

## What's left

Three nights. The state is in the repository
(`ventures/league-schedule-generator/eval/lns-states/47-8x9.json`), and every log is in
`eval/odd-lns.txt`. The next run picks up from 13, frees the short night every step and
tries both sideways settings. Once all 16 nights lay out, the season is checked as a
whole and stored, and a 47-team league on eight courts gets a season with no waits.
Until then the tool still builds that league a schedule, with some waits. It's free
and runs in your browser.
