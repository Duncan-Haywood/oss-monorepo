---
title: "A 31-team round robin: from 245 back-to-back home or away games to 60"
seo_title: "Round robin home/away breaks for 15 and 31 teams"
date: 2026-11-12
tags: [league-schedule-generator, scheduling, algorithms, round-robin]
description: "Leagues of 15 and 31 teams missed yesterday's home/away fix. A climbed starter now gives 31 teams 60 breaks instead of 245; two other ideas were tested too."
---

Yesterday's change to the [league schedule generator](../../ventures/league-schedule-generator/README.md)
read home and away straight off a *starter* timetable. Odd-sized leagues of 17 to 39 teams went
from 4 to 10 back-to-back home or away games ("breaks") per team to under 2. Two sizes missed out:
15 and 31 teams.

## Why 15 and 31 were left out

With a bye team added, 15 and 31 teams become 16 and 32, which are powers of two. At those sizes
the search starts from a different construction, Russell's finite-field timetable. Its carry-over is
as low as any round robin's can be. It has no built-in starter, so the shift-venue candidates were
never tried there. With a bye, the general home/away search then left 15 teams with 41 breaks and
31 teams with **245**: about 8 per team.

## The fix

The same climb that made yesterday's starter table, run for 30 seconds on 16 and on 32 teams,
found a starter for each odd case. With a break weight, the search now scores it next to the field
timetable and keeps it only when carry-over + 10 x breaks is strictly lower:

| Teams | Before (carry-over / breaks) | Now | Score at weight 10 |
|---|---|---|---|
| 15 | 195 / 41 | **195 / 28** | 605 -> 475 |
| 31 | 899 / 245 | 1,189 / 60 | 3,349 -> 1,789 |

At 15 teams the carry-over stays exactly the same and only the breaks drop. At 31 the search gives
up some carry-over to cut breaks by three quarters. That is the trade the "balanced" setting asks
for; the "most even carry-over" setting (weight 0) is unchanged. At 7, 8, 16 and 32 teams the
climbed starters did not beat the field search, so nothing changed.

## A small gain: anneal the candidate under its own break cap

The shift candidates were used as they are, with no search. Now each one also goes through the
capped search, which lowers carry-over while carrying every match's home/away along and never going
above the candidate's own breaks. 11 teams went from 153 / 10 to 137 / 10, 13 teams from 253 / 12
to 215 / 12, and 39 teams moved slightly on one seed. Nothing changed at any other size from 9 to 40:
above 16 teams the climbed starters look like local minima for these moves, even with up to 16
breaks of slack.

## A negative: carry the hosts through the search

Every move in the carry-over search keeps the set of pairs, so a pattern of "who hosts whom" from
the starter fits any timetable the search reaches. It is still a valid home/away, and every team
keeps the same number of home games. We gave that to the home/away search as one more starting point.
Across 60 runs (sizes 9 to 40, two seeds) it changed one: 22 teams, 66 breaks to 64. Using it to
price moves inside the search made 14 teams worse. The search's moves break the pattern faster than
the venue search can use it. It stays in the code, switched off, so the measurement can be re-run.

These are search measurements on made-up team names; no organiser has run a 31-team league
through it yet. Figures and scripts: `eval/field-shift.txt`, `eval/shift-carry.txt` and the
README section "Shift venues carried through the search".
