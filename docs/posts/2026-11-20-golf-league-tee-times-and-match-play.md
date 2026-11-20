---
title: "A golf league's tee sheet and match play points, free in the browser"
seo_title: "Golf league schedule with even tee times and match play scoring"
date: 2026-11-20
tags: [ventures, league-schedule-generator, product]
description: "The free league scheduler now builds a nine-hole golf league season with tee times dealt evenly and scores weekly match play with handicap strokes."
---

A twilight golf league has two weekly chores. The first is the tee sheet: who plays whom, on
which nine, and at what time. The second comes after the round: handicap strokes on the right
holes, a point for each hole, the net points, the standings, and next week's handicaps. Many
league secretaries do both in a spreadsheet. Others pay for golf league software that does
these two jobs.

The [golf league page](https://marisstella.app/league-schedule-generator/golf-league-schedule.html)
now does both, free, with nothing uploaded.

## Tee times are a fairness problem

Teams notice when one of them always goes off at 4:30 and another always tees off last and
finishes in the dark. A team that plays 18 weeks with 4 tee times can have each one 4 or 5 times,
and no closer. The page tries to give every team exactly that.

It treats each week as an assignment problem. The cost of a tee time for a group is how far it
pushes the two teams' counts from even, plus a little for having the same time as last week. The
Hungarian method solves each week exactly given all the others. The page sweeps the season
until no week improves, re-deals a few weeks at random to get out of dead ends, and finishes with
a tabu search that swaps groups within a week to pull the remaining teams back in.

We measured it on 77 seasons, 4 to 20 teams over 10 to 22 weeks:

| Method | Seasons with every team at its share | Teams at their share |
|---|---|---|
| Hand rotation (every group one slot later each week) | 4 of 77 | 90 of 868 |
| Page search, before the tabu step | 50 of 77 | 774 of 868 |
| Page search, with tabu and 6 stored solver deals | 71 of 77 | 849 of 868 |

A SAT solver settled the last 6. It proved that no tee-time deal of this round robin gives every
team its share in a 4-team league over 10, 14, 16, 20 or 22 weeks, or 20 teams over 10 weeks. For
those seasons the page says the shortfall is the season's limit, not a missed deal. For 6 seasons
the search couldn't finish but the solver could, the solver's deal is stored with the page and
checked again in the browser before it is used. The scripts and numbers are in the project's
`eval/golf-tee-grid.txt` and `eval/golf-tee-sat.txt`.

## Match play with strokes on the right holes

Type the course card (par and stroke index for 18 holes), the teams' players, and each night's
hole-by-hole cards. In each group, low handicap plays low handicap. The higher handicap gets the
difference in strokes, one on each of the nine's hardest holes by the card's index. Each hole is a
point, each pairing's low net is another, and the team's low net is two more. All of those numbers
can be changed.

The night the tests recompute: Ana (5) plays Cy (2), so Ana gets 3 strokes. On net they win four
holes each and halve one, and Ana's net 36 beats 37, so it ends 5.5 to 4.5. Ben (12) and Dee (14)
finish level at 5 each. The Hawks' team net of 71 beats 72 for two more, so the Hawks win 12.5 to
9.5.

League handicaps come from each round's score over par for the nine. Each hole is capped at net
double bogey first, then the page takes a percentage of the average of the best rounds out of the
last few. The defaults are 90% of the last 5 rounds, capped at 18. This is a league handicap for
league play only, not a Handicap Index under the World Handicap System.

## What it doesn't do yet

No real league has used it yet. It has one stroke-index row per course, so men's and women's
tees aren't separate, and it has no skins game or flighted play-offs. If you run a golf league
and want one of those, the website request form is how to ask.
