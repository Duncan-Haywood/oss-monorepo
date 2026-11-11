---
title: "Who you play after the champions: carry-over in round-robin schedules"
seo_title: "Carry-over in round robin schedules: circle method vs real leagues"
date: 2026-11-11
tags: [league-schedule-generator, scheduling, algorithms, open-data]
description: "The circle method keeps sending the same teams into the same opponent straight after the strongest side. The schedule generator now evens that out."
---

A round robin decides two things: who you play, and who your opponent played
the week before. The second one is easy to miss. If the strongest team in the
league is always followed by the same opponent, that opponent keeps meeting
sides who have just been run ragged, rested their stars or driven two hours.
Sports schedulers call this the **carry-over effect**. Russell gave it a number
in 1980: for every pair of teams (A, C), count how many teams play A and then C
in their next game, square the counts and add them up. Lower is fairer.

The [league schedule generator](https://marisstella.app/league-schedule-generator/)
has always written rounds by the circle method, the textbook way. It gives the
fewest possible back-to-back home or away games. It is also close to the worst
possible carry-over. With eight teams, five of one team's seven opponents arrive
straight from the same side. The value is 148. The least any eight-team round
robin can have is 48.

## What changed

- Every schedule's report now shows its carry-over value, the floor for that
  many games, and the worst repeat. When one pair repeats three or more times,
  it says so.
- A new tick box, **Spread who you meet next**, searches for rounds with an
  even carry-over. For 12 teams in a browser it took 1.4 seconds: the value went
  from 768 to 182, and the worst repeat from 9 to 3. The cost was 16 home/away
  breaks instead of the minimum 10, and the report says so. If every team plays
  at the same venue, breaks don't matter and the even carry-over costs nothing.

The search starts from the circle method and keeps making changes that leave a
valid round robin. It swaps the order of two rounds. It swaps two teams'
opponents over the fewest rounds that still has every pair meeting once. And it
exchanges two rounds' games along one cycle. That last move, the one the
literature usually reaches for, can't escape the circle method on its own when
the number of teams minus one is prime: every two rounds then form one long
cycle. The team swap is what gets it out. A second pass trades a little
carry-over for fewer breaks. Then a separate search sets home and away. On the
plain circle timetable, that search finds the minimum n − 2 breaks for every
size tested, 6 to 20 teams.

The checks are tests, not adjectives. All 720 ordered schedules for six teams
are enumerated: the best has a cyclic value of 60, and so does the circle
method, so for six teams there is nothing to gain. For eight teams the search
reaches 56, which is Russell's lower bound, so it is optimal.

## How real leagues compare

openfootball publishes the fixture lists of the big European leagues as open
data (CC0). I scored 20 seasons, 2021-22 to 2024-25, ordering each team's games
by matchday:

| Schedule | Teams | Carry-over | Breaks |
|---|---|---|---|
| Bundesliga, four seasons | 18 | 3,474 to 4,342 | 48 |
| Ligue 1, 2023-24 and 2024-25 | 18 | 1,840 and 1,948 | 74 and 96 |
| Circle method, mirrored | 18 | 14,610 | 48 |
| This tool | 18 | 1,926 | 74 |
| Premier League, La Liga, Serie A, Ligue 1 (14 seasons) | 20 | 2,278 to 2,564 | 70 to 146 |
| Circle method, mirrored | 20 | 21,044 | 54 |
| This tool | 20 | 2,136 | 114 |

None of the professional leagues use the plain circle method. The Bundesliga
keeps the minimum number of breaks every season and pays for it with 1.4 to 2.4
times the others' carry-over. The tool lands among the professional schedules on
both counts. That is an easier job than theirs, though: it knows nothing about
derbies, police requests, European nights or television slots.

## What it doesn't know yet

- Whether carry-over moves results at rec-league level. That needs a real
  league's results and some idea of team strength, and I don't have either.
- A double round robin is still the first half mirrored. Mirroring doubles
  every count, so the worst repeat over a 20-team season is 6. Optimising both
  halves together is the next step.
- How close the search gets to the true optimum above eight teams. For 12 teams
  it finds 156 against a floor of 120, and nobody has told me what the optimum
  is.

The guide [how to balance carry-over in a round robin](https://marisstella.app/league-schedule-generator/how-to-balance-carry-over-in-a-round-robin.html)
has the worked example. The code is `carryover.mjs` in the
[repository](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator),
and `node eval/carryover-real.mjs` reproduces the table.
