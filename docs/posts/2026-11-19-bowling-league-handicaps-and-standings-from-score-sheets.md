---
title: "A bowling league's weekly sums: averages, handicaps and standings from typed score sheets"
seo_title: "Bowling league handicaps and standings, free in the browser"
date: 2026-11-19
tags: [ventures, league-schedule-generator, product]
description: "The free bowling league scheduler now turns typed score sheets into averages, handicaps, points, standings and position-round pairings, in the browser."
---

A bowling league's schedule is written once in August. The league secretary's real work comes
every week after that. They collect the score sheets, add each bowler's games to their average,
work out next week's handicaps, score every match with handicap, award the points, and post the
standings. Weeks before the end, the standings also decide a position round: 1st bowls 2nd, 3rd
bowls 4th.

The [bowling page](https://marisstella.app/league-schedule-generator/bowling-league-schedule.html)
of the league schedule generator did the first part well. It rotates every team across the lane
pairs as evenly as the season allows, and a SAT solver proves which seasons can't be made even.
Then it stopped. A secretary left the page with a schedule and went back to a spreadsheet they
keep up by hand, or to paid league software, for the rest of the season.

## What it does now

Under the schedule there is a "League nights" box. You type each night the way it reads off the
sheet:

```
Week 1
Pin Pals: Ana 150 160 170, Ben 200 210 220
Rolling Thunder: Cy 180 180 180, Dee absent
```

From that it works out:

- **Averages**, as total pins over games bowled with fractions dropped, counting every night
  before this one. A new bowler uses the entering average you give (last season's book average).
  With none, their first night's games set it for that night.
- **Handicaps**, as a percentage of the gap between a basis and the average. At 90% of 220, a 160
  average is 0.9 × 60 = 54 pins a game, and a 165 average is 49, since 49.5 rounds down. A
  percentage of 0 makes it a scratch league.
- **Absent bowlers**: each game they score their average minus 10, plus their handicap. Those games
  never count toward their average. A bowler absent with no average yet, or an empty spot in a
  short team, is a blind: 150 pins a game with no handicap.
- **Points**: 2 for each game won on handicap totals and 2 for the series, with a tie split. In an
  odd league the team drawn against the Vacancy bowls against its own par, the sum of its bowlers'
  averages plus handicaps, so it earns points by beating its average.
- **Standings** by points won, then pins with handicap. A **position round** is paired from the
  standings before that night, so "1st place v 2nd place" on the schedule becomes two team names.

Every number above is a setting: games a night, bowlers a team, the percentage, the basis, a
handicap cap, points per game and series, the absent penalty and the blind score. These are one
common set of rules, not a sanctioning body's. The league's own rules and its association's decide.

You can copy the recap as text for the notice board or the group chat, or download the standings
and the bowlers' averages as CSV files. The score sheets stay in your browser and come back on
your next visit. Nothing is uploaded.

## How it was checked

The tests work two nights out by hand and check that the code gets the same numbers. On night one,
Ana's first games set her average to 160 and her handicap to 54. Ben's 210 average gives a
handicap of 9. Cy averages 180 with a handicap of 36, and Dee is absent with no average, so Dee
counts as a blind at 150. The team totals come to 413, 433 and 453 against 366 three times. On
night two, Ben is absent and scores 210 − 10 = 200 plus 9. His average stays at 210, because
absent games don't count.

Other tests cover a tie that splits the points, using entering averages. One builds a position
round from night one's standings. A Vacancy match goes tie, loss, win against par, with the series
tied. Eight typing slips are each named in plain words rather than guessed, from a missing
opponent to one bowler typed on two teams. In a phone-width browser, the sample nights fill the
tables with no sideways scroll, and they come back after a reload.

## What it doesn't do

It has no split handicaps per game, no substitutions in the middle of a night, no sanctioned
average reports and no prize fund. If your league needs those, keep the league software your
association recommends. No real league has used this yet. If you run one and it gets a number
different from your sheet, that is the report worth having.
