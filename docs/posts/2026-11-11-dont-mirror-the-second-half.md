---
title: "Don't mirror the second half: carry-over in a double round robin"
seo_title: "Double round robin schedule without mirroring: lower carry-over"
date: 2026-11-11
tags: [league-schedule-generator, scheduling, algorithms, open-data]
description: "Mirroring the first half of a double round robin doubles every carry-over count. Searching the season as a whole cuts the carry-over value by 22% and beats every top-flight fixture list in our data."
---

Most double round robins are built the lazy way: write the first half, then
play it again with home and away swapped. The circle method does this, and so
do many professional leagues. It keeps the halves tidy. It also repeats every
team's order of opponents. If you met the league leaders' last opponent right
after them in the autumn, you meet them right after them again in the spring.

Earlier today the
[league schedule generator](https://marisstella.app/league-schedule-generator/)
learned to even out the **carry-over effect** (who you play right after whom,
scored by Russell's carry-over value: lower is fairer). For a double round
robin it still mirrored the searched half, so every count came out doubled.
The worst pair for 18 and 20 teams carried over 6 times.

## Searching the season as one piece

The new search keeps the shape leagues expect. Each half is still a full round
robin, each pair still meets once at each ground, and every team still gets
exactly half its games at home. It adds one rule mirroring never needs: no team
meets the same opponent in two consecutive games across the halfway line. Then
it treats the second half as free to differ from the first. It anneals the
whole season with the same moves the single round robin uses (swapping rounds,
swapping two teams' fixtures, exchanging games between two rounds), one half at
a time. One of its two starting points is the mirrored season itself, so it can
never come out worse than mirroring.

## Numbers on real fixture lists

Same 20 top-flight seasons as before (openfootball, CC0; 2021-22 to
2024-25), each team's games ordered by matchday:

| Double round robin | Teams | Carry-over value | Home/away breaks |
|---|---|---|---|
| Bundesliga | 18 | 3,474 to 4,342 | 48 |
| Ligue 1 (18-team seasons) | 18 | 1,840 and 1,948 | 74 and 96 |
| Tool, searched half mirrored | 18 | 1,926 | 74 |
| **Tool, whole season** | 18 | **1,502** | 106 |
| EPL, La Liga, Serie A, Ligue 1 | 20 | 2,278 to 2,564 | 70 to 146 |
| Tool, searched half mirrored | 20 | 2,136 | 114 |
| **Tool, whole season** | 20 | **1,658** | 134 |

That is 22% under the tool's own mirrored season at both sizes, and under
every professional season in the data. The price is breaks (two home or two
away games in a row). At 20 teams it lands inside the leagues' range. At 18
teams it has more than either league. The professional lists also carry
derbies, police requests and TV slots, which the tool knows nothing about. So
this is not a claim that it would schedule the Premier League better. It is a
claim about the one number it optimises, measured the same way on both sides.

## What it means for a rec league

Tick "Double round robin" and "Spread who you meet next" and the page now
builds the season this way. If all your games are at one venue, breaks do not
matter and the lower carry-over costs you nothing. If home grounds matter,
leave the box unticked: the circle method still gives the fewest breaks
possible.

Still open, and written down in the
[README](../../ventures/league-schedule-generator/README.md): the worst single
count (5 or 6) is not yet in the search's cost. The gap to the theoretical floor
(1,502 against 1,170 at 18 teams) may be the search rather than the problem.
The search takes 2 to 4 seconds and should move off the page's main thread.

*Free and as-is, without warranty. Check every pairing and date before you
announce a schedule.*
