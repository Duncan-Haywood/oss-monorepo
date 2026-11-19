---
title: "In an Americano night with sit-outs, the scoring rule picks a different winner about one night in four"
seo_title: "Americano sit-out scoring: a free live leaderboard"
date: 2026-11-19
tags: [ventures, league-schedule-generator, product]
description: "A free phone scorer for padel and pickleball Americano and Mexicano nights, and a simulation of how much the sit-out rule decides the winner."
---

An Americano is the social doubles format padel and pickleball clubs run on weeknights. Partners
rotate every round, every player keeps the points their side scored, and whoever has the most
points at the end wins. The
[league schedule generator](https://marisstella.app/league-schedule-generator/) has built the
rotation for a while. With a court for every four players it uses a stored whist design, so
everyone partners everyone else exactly once. But it stopped at the rotation sheet. The organiser
standing at the courts still kept score on paper or in a separate app.

So there is now an
[Americano and Mexicano scorer](https://marisstella.app/league-schedule-generator/americano-night.html).
You list the players and say how many courts you have, then type each court's score as the games
finish. If games are played to a total such as 24, typing one side fills in the other. The
leaderboard is right after every game. In Mexicano mode the next round is drawn from the table as
soon as the last score is in. The night is saved on the phone, so a refresh loses nothing. A share
link gives the players a read-only copy of the table, and the night travels inside the link
itself, so nothing goes to a server.

## The question every organiser hits: what do sit-outs count?

With 10 players on 2 courts, two people sit out every round. Over six rounds some players sit out
once and some twice. A player who sat out twice has played one game fewer, so on raw points they
are a game's worth behind before anyone has hit a ball. Clubs handle this three ways. Some ignore
it. Some give a sit-out the player's own average per game. Some give half a game's points. The
scorer offers all three, with average as the default, and shows the credit separately in the
table.

How much does the choice matter? A simulation gives a sense of it. These are model numbers, not a real club's. Each
player gets a hidden skill. A game goes to 24 points, and each point goes to a side with a
probability set by the gap between the two partners' summed skills. For every size from 5 to 15
players that leaves someone sitting out, 2,000 six-round nights were dealt with the page's own
rotation and each was scored under all three rules
([`eval/sit-out-credit.txt`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/league-schedule-generator/eval/sit-out-credit.txt)).

| Players, courts | Best player wins: no credit | with average credit | Winner changes |
|---|---|---|---|
| 7 on 1 | 45.4% | 57.6% | 41.4% |
| 9 on 2 | 53.4% | 65.0% | 36.9% |
| 10 on 2 | 56.9% | 63.0% | 18.4% |
| 11 on 2 | 44.1% | 58.5% | 43.0% |
| 13 on 3 | 50.0% | 61.4% | 37.4% |
| All sizes | 54.2% | 62.5% | 26.7% |

Across all sizes the average credit gives a different winner in 26.7% of nights. In 72.8% of nights
the winner without credit had sat out fewer rounds than someone else. Six players on one court is
the control: over six rounds everyone sits out exactly three times, and no rule changes anything.

So the rule is not a detail. Without credit, an uneven night partly rewards whoever happened to be
dealt more games. Settle the rule before the night, tell the players, and the scorer applies it
the same way to everyone.

## What it does not do

It does not rate players or keep a club ranking across nights, and it cannot tell a real score from
a typo; check the table before you announce a winner. The model above assumes skill alone decides
points. Real nights have fatigue, partners who click and games stopped by the clock, so treat the
percentages as the size of the effect, not a forecast.

The scorer is free and MIT licensed, like the rest of the generator. The code is
[`night.mjs`](https://github.com/duncan-haywood/oss-monorepo/blob/main/ventures/league-schedule-generator/night.mjs)
and its tests are in `night.test.mjs`.
