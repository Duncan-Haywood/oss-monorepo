---
title: "Putting a team's blackout date on its bye: 28% fewer makeup games"
seo_title: "Round-robin scheduling around team blackout dates"
date: 2026-11-13
tags: [ventures, league-schedule-generator, algorithms]
description: "Choosing which team takes which slot of the circle method, around the dates teams can't play, cut makeup matches 28% on 640 random leagues."
---

Every rec league organiser collects the same list before the season: the
dates each team cannot play. A tournament weekend, a school trip, a wedding.
The usual way to handle it, and the way the
[league schedule generator](https://marisstella.app/league-schedule-generator/)
did it until today, is to build the round robin first and then move every
match that lands on a blocked night to a makeup round at the end of the season.
That works, but it makes the season longer and leaves the end of it as a
jumble of rescheduled games.

**The schedule has a freedom that this ignores.** The circle method (the
standard round-robin construction) fixes who meets whom in each round by
*position*: position 1 meets position 6 in round 3, and so on. Which real team
sits in which position is arbitrary. Swap two teams' positions and you still
have a valid round robin. Each team's home/away pattern moves with it, so the
balance is unchanged.

So the positions can be chosen to suit the blackout list:

- In a league with an **odd number of teams**, someone sits out every week. If
  a team's blackout night is the night it would have had its bye anyway,
  nothing has to move.
- In an **even league**, every team plays every week, so a blackout always
  costs a match, unless the team it was due to play is out that night too.
  Two teams away on the same school holiday can be drawn against each other
  that week, which leaves one makeup game, not two.

**How it searches.** The new step tries swapping two teams' positions (at
least one of them a team with a blackout) and builds the dated season for
each candidate with the tool's normal placement code. It keeps the swap when
the season is no worse on three keys, in order: fewer matches needing a
makeup, an earlier last date, fewer home/away breaks (a team at home, or away,
twice in a row). It starts from the old schedule, so it never needs more
makeup matches than before. Its budget is counted in evaluations, not seconds,
so a shared link rebuilds the identical season on another computer.

**What it bought**, on 640 random leagues of 5 to 16 teams, single and double
round robins, each team giving one or two dates it can't play:

| | before | after |
|---|---|---|
| makeup matches | 5,431 | 3,911 (28% fewer) |
| mean season length | 18.04 weeks | 17.22 weeks |
| home/away breaks | 20,156 | 14,732 (27% fewer) |
| invalid schedules | 0 | 0 |

The biggest gains are in odd leagues: 13 teams with one blocked date each went
from 48 makeup games to 27. When several teams share the same few blocked
nights, the gains can be dramatic: a 7-team double round robin with two shared
holiday dates went from 30 makeups to 3, and five of eight such leagues needed
none at all. Even leagues gain less, as the reasoning above predicts: 16 teams,
one date each, 107 down to 93.

The fall in breaks was a side effect we did not set out to get. Moving
rounds around blackouts had been quietly adding breaks; with breaks as the
tiebreak, the search removes many of them. It is not a win everywhere. In a
few cells breaks went up because the search took fewer makeups instead (10
teams, two dates each: 156 to 188), and a league that cares more about home
and away than about season length would weigh that differently.

These are synthetic leagues. The next test is a real league's blackout list,
and the same step on the multi-division page, which still moves blocked games
after the build. The code is MIT licensed: `fitPlanToBlackouts` in
`ventures/league-schedule-generator/calc.mjs`, and the measurement is
`eval/blackout-fit.mjs`.
