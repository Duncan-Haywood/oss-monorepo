---
title: "207 scans of the same state: making a league scheduler's search 2.1x faster without changing a single answer"
seo_title: "Speeding up a round-robin break search: memoised walk, backward table"
date: 2026-11-13
tags: [ventures, league-schedule-generator, algorithms, performance]
description: "Counting what a seeded search actually repeated found 3.5 million scans of 16,828 states. Caching them, plus a backward table, made the league scheduler 2.1x faster with identical seasons."
---

The [league schedule generator](https://marisstella.app/) looks for round-robin
seasons that balance two things organisers care about: **breaks** (a team at
home, or away, two rounds running) and **carry-over** (how unevenly "who did
my opponent play just before me" falls). For leagues of up to 22 teams, the
page now runs an annealing search that prices every candidate timetable on its
*proved* fewest breaks. Larger leagues were too slow for that: 24 and 25 teams
took 2 to 6 minutes.

Today's change makes that search 2.1x faster across eight test leagues
(1,533 s down to 725 s). Every one of the eight returns exactly the same
seasons it did before.

## Count before you optimise

The proof has two parts. A dynamic programme over rounds finds the fewest
breaks any choice of hosts allows. A seeded depth-first walk back over the
programme's table then finds the fewest breaks among host choices that keep
each team's home and away games within one of each other. At each step the
walk looks at the previous round's 4,096 host choices (12 matches) and keeps
the ones that can still meet the target.

The earlier write-up put 37 seconds of a 24-team run in that scan. Before
writing anything, I counted the scans and the distinct states they were for:

- **3,481,691 scans**
- **16,828 distinct (round, host choice) states**

That's about 207 scans per state. The walk goes back over the same ground at
every slack level (floor, floor + 1, …), and again from every branch that
reaches the same state. So now each state's list is computed once, keeping the
choices within the walk's largest slack, and each later visit only filters it.

## Fast, and still exactly the same

The search is seeded, and organisers share links that rebuild a season from
its seed. So a speed-up that changed which season came out would break links
people had already sent. The cached list is stored in the same order the fresh
scan produced, and filtering it by the current slack gives the same items in
the same order. So the seeded shuffle draws the same random numbers and the
walk takes the same path. A test checks this on 48 timetables: with no cache,
a full cache, and a cache that fills up part-way, the walk returns the same
least, the same proof, the same step count and the same hosts.

## The idea that saved less than expected

The other cost was rerunning the programme after each move. The table used to
rerun from the first changed round to the end of the season. Now it also keeps
a backward table (fewest breaks from round r to the end, given round r's
hosts), so a move only reruns the rounds between its first and last change and
then meets the backward table with one more step.

This helped less than hoped, and the reason is worth knowing. The search's
moves cover **15 of 23 rounds on average**. A partial team swap or a
three-round re-deal touches rounds far apart, and everything between them has
to be rerun. A small tweak to the step's inner loop (branch-free, with lookup
tables for the bit shuffles) added about 15%. Another variant I tried was
slower, so I dropped it.

| Teams, seed | before | after |
|---|---|---|
| 20, 1 | 8.7 s | 3.6 s |
| 22, 1 | 31.8 s | 13.9 s |
| 24, 1-3 | 130-283 s | 80-173 s |
| 25, 1-3 | 124-377 s | 54-184 s |

22-team leagues, which the page already runs, now take about 14 seconds on the
test league instead of 32. 24 and 25 teams still take up to three minutes, so
they stay off the page for now. Almost all of the remaining time is the
programme's step over those wide move spans. The next step is either moves
that touch fewer rounds or a faster step.

Measurements, the comparison script and both test suites are in the venture's
README ("A backward table") and `eval/backward-table.txt`. All the leagues
here are randomly generated; no real league's season was timed.
