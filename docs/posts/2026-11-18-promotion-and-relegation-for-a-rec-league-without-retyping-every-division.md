---
title: "Promotion and relegation for a rec league, without retyping every division"
seo_title: "Promotion and relegation between league divisions, free tool"
date: 2026-11-18
tags: [ventures, league-schedule-generator, product]
description: "The multi-division schedule page now moves the top teams up and the bottom teams down into next season, and flags the places a table cannot decide."
---

A darts or pool league with three divisions ends its season with a small, fiddly job. Read the tables.
Move the winner of Division 1 up and the bottom of the Premier down, and the same one line lower. Play the
promotion play-off if the league has one. Drop the two teams that are not coming back, add the three new ones
to the bottom division, and retype all of it into next season's sheet. Nothing about it is hard. It is easy to
get wrong, though, and the mistakes (a team in two divisions, a division one team short) only show up on the
first night.

The [multi-division schedule page](https://marisstella.app/league-schedule-generator/multi-division-league-schedule.html)
already kept the standings for each division. It now has a **Next season: promotion and relegation** box under them.
You type the ladder, top first (`Premier > Division 1 > Division 2`), how many go up and how many go down, and,
if you want, a play-off at each line, the teams leaving and the new entrants. It shows each move with its reason
(`A5: Premier -> Division 1 (place 5 of 5, relegated)`) and next season's divisions. One more click puts them into
step 1 with the old results cleared, ready to build. Divisions you leave out of the ladder, such as age groups,
stay as they are.

## What it refuses to decide for you

A table settles most places. It does not settle all of them, and those cases are where an organiser most needs
to slow down:

- **Two teams level on everything at the line.** If the teams in 4th and 5th are level on points, goal
  difference and goals scored, and 5th goes down, the table only has them in that order because of how they were
  typed. The tool says so: "A4 and A5 are level on every tie-break at place 4, a promotion or relegation line.
  Decide it (a play-off or a draw), then type the result or a points adjustment."
- **Games still to play.** If a ladder division has unplayed games, the moves are shown with a warning that the
  places can still change.
- **A play-off not yet played.** The upper team keeps its place, and the play-off is listed as still to play.
  When you type the winner's name the two teams swap.
- **Moves that cannot work.** A promoted team whose name is already used in the division above, two up and two
  down from a division of three, a division left with one team: these are errors, with no divisions text, rather
  than a sheet that breaks later.

## What was checked

Six tests on a made-up three-tier league with an age-group division beside it. They check every team appears
exactly once, division sizes are kept when up equals down, the play-off works both pending and decided, the
tie and the unplayed games are warned, and leaving, joining, name clashes and impossible counts are refused.
A Chromium run then clicks through the page: show, start next season, build next season with a new entrant.
These are made-up leagues. No real league's end-of-season moves have been compared yet. If you run a tiered
league and try it, the place it is most likely to disagree with your rules is the play-off format, since leagues
pair those places in different ways.

The code is MIT licensed and runs in your browser. Nothing is uploaded:
[README, "Promotion and relegation into next season"](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/league-schedule-generator).
