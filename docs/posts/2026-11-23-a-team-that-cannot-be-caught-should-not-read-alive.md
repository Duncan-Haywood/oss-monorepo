---
title: "A team that cannot be caught should not read \"alive\": exact clinch calls on 18 real seasons"
seo_title: "Exact clinch and elimination calls for a league table"
date: 2026-11-23
tags: [algorithms, sports-scheduling, league-schedule-generator]
description: "Our league table now proves clinched and eliminated by branch and bound past 12 games left. On 18 real seasons it called 131 races earlier and was never wrong."
---

The [League Schedule Generator](../../ventures/league-schedule-generator/) has a race table:
after you type the results so far, it says who has clinched a play-off place and who is out.
Those two words have to be right. A league that posts "clinched" and then sees the team
miss out has a problem no tie-break can fix.

Until today the table was exact only when 12 or fewer games were left, because it tried every
finish (3^12 = 531,441 of them). With more games left it fell back to safe bounds: assume every
rival can win all of its games. That bound is never wrong, but it is loose. Two chasers who
still play each other twice cannot both win out, and the bound pretended they could.

## What changed

The new module, `race-exact.mjs`, asks three questions for each team: its worst place with ties
lost, its worst place with ties won, and its best place. It answers them by branch and bound,
and three observations keep the tree small:

- A team that is already over the line, or that cannot reach it even by winning out, no longer
  matters. Its games are settled whichever way helps the question, without branching.
- Only games between two teams still in doubt branch.
- When asking for the fewest teams above, look for a game where every result pushes one of the
  two teams over the line. Each such game forces one more team above. A greedy matching on those
  games is a valid lower bound.

Every question has a node budget. When the budget runs out, the old bound stands. That keeps the
rule that "clinched" and "out" are never wrong, and the page note says which method gave the
answer.

## Checked on real seasons

We replayed 18 top-flight seasons (England, Germany, Spain, France and Italy, 2021-22 to
2024-25; results from openfootball, public domain) one match date at a time. After every date we
asked three races: the title, the top four and safety from relegation. That made 6,144 tables.

| Race | Teams settled earlier than the bounds | Match dates earlier, total (most for one team) |
|---|---|---|
| Title | 9 | 15 (3) |
| Top four | 39 | 76 (5) |
| Safety | 83 | 194 (6) |

There were no wrong calls. No clinched team finished outside its places and no eliminated team
finished inside them. The search also never contradicted the bounds where the bounds had
decided. Relegation gains the most, because that is where several teams in doubt still play
each other late in the season. In Serie A 2023-24 the search settled 12 teams' safety races
33 match dates earlier in total.

87.4% of the tables were proved in full. The rest still have their bounds. A table took 14 ms
on average and 673 ms at worst.

A small league gains for the same reason. An eight-team rec league with four weeks left has 16
games to go, which is past the enumeration, and its leaders may still have to play each other.

## What it does not check

openfootball does not record point deductions, so our "final table" is the one the results
give. We also did not compare against published clinch dates. Full numbers are in
`eval/race-real.txt` and the venture README, in the section "Clinched and out, proved past 12
games left". The next step is the same search for the magic number (the points that guarantee
a place), which still assumes every rival wins out.
