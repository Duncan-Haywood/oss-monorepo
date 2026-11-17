---
title: "A shorter league season gave the bottom team the top ten: fixing strength of schedule"
seo_title: "Shorter round robin season: even strength of schedule"
date: 2026-11-17
tags: [ventures, league-schedule-generator, algorithms]
description: "Cutting a round robin short handed the last-listed team the ten strongest opponents. Relabelling teams brings each tested league within 0.6 seed places of even."
---

Most rec leagues cannot play a full round robin. Twenty teams need 19 weeks; the gym is
booked for ten. The [league schedule generator](https://marisstella.app/league-schedule-generator/)
has a "Rounds to play" box for that, and until today it played the first ten rounds of
the circle method.

## What went wrong

The circle method fixes one team and rotates the others around it. In round *r* the
fixed team, the last one listed, plays team *r*. So over the first ten rounds it plays
teams 1 to 10. The page already asks organisers to list teams best first (for pool play
and play-off seeding), so in a seeded league the bottom team met the **ten strongest
sides** and none of the weak ones. Its opponents' mean seed was 5.5; an even share is
10.0. The rest of the table was skewed the same way, by less.

It gets worse as leagues grow: 4.5 seed places off at 20 teams over 10 rounds, 8.5 at 30
teams over 12, 21.5 at 64 teams over 20.

## The fix: move teams, not games

Which team takes which place in a round robin is free. Swapping two teams' places keeps
every place's home/away sequence, so the back-to-back home or away count, which the tool
already holds at its proved minimum, does not change, and nobody meets twice. What
changes is who meets whom in the rounds that are played.

So the new option searches those relabellings for the one where every team's opponents
average closest to the mean seed of every other team. It is a seeded annealing search on
pair swaps: each step updates only the opponents' sums of the two moved places, so it
tries 60,000 relabellings for 20 teams in under 0.05 s, and the same share link rebuilds
the same season.

| league | plain shorter season | balanced | exact best |
|---|---|---|---|
| 8 teams, 5 rounds | 1.03 | 0.34 | 0.34 |
| 10 teams, 6 rounds | 1.50 | 0.11 | 0.11 |
| 20 teams, 10 rounds | 4.50 | 0.56 | not enumerable |
| 30 teams, 12 rounds | 8.50 | 0.36 | not enumerable |
| 64 teams, 20 rounds | 21.50 | 0.54 | not enumerable |

Worst team's gap, in seed places. For 6 to 10 teams every relabelling can be tried (3.6
million at 10 teams), and the search found the exact optimum on all five sizes checked.

## What did not work

Choosing *which* rounds to play as well as who sits where sounds like more freedom. It
did not lower the worst gap reliably, and it wrecked the home/away pattern: 12 teams over
8 rounds went from 6 back-to-back home or away games to 34. That was dropped.

## Using it

Type the teams best first (last season's final table works), set "Rounds to play", and
tick **"Shorter season: even out strength of schedule"**. The notice under the schedule
says how far from even the worst team is. If you have no idea who is strong, leave it off;
with a full round robin it does nothing, since everyone plays everyone.

Method, measurements and tests: the tool's
[README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator),
`eval/seed-balance.txt` and `seed-balance.test.mjs`.
