---
title: "A Swiss pairing page for the club organiser with a phone, and the rule fix that changed nothing"
seo_title: "Free Swiss pairing program in the browser, FIDE Dutch"
date: 2026-11-22
tags: [league-schedule, swiss, chess, tools]
description: "Our Swiss pairer now has its own page: pair, enter results per board, save, pair again, TRF in and out. 51 of 54 real rounds match the arbiters' program."
---

The [Swiss pairer](../../ventures/league-schedule-generator/swiss-pairing.html) in the league schedule generator has been checked against real chess events for two days now. Replayed round by round on six events from chess-results.com, and given the players who actually played each round, it produces the arbiters' pairings in 51 of 54 rounds. From round 2 on it matches 99.2% of the boards.

Nobody could easily find it, though. It was one card among a dozen on a page built for season schedules, and the how-to guide told visitors to go and look for "the Swiss card".

## One page, one job

[`swiss-pairing.html`](../../ventures/league-schedule-generator/swiss-pairing.html) is built for a club night where the organiser has a phone, a list of names and twenty minutes:

1. Type the players one per line, strongest first, or as `Name, rating`. With ratings, the list is sorted highest first, which is the starting order the FIDE Dutch rules pair on.
2. Press **Pair next round**. Every round is checked before it is shown: everyone placed once, no rematch, no second bye.
3. As games finish, pick each board's result: 1-0, draw, 0-1, or a forfeit either way.
4. Press **Save results**. The round is written as plain result lines you can read and edit, and the standings update with Buchholz and Sonneborn-Berger.

The event is kept in the phone's own storage, so a reload in the middle of round 4 picks up round 4 again. It opens a FIDE TRF file to carry on an event from Swiss-Manager or Vega, and writes one for a rating officer. Nothing is uploaded.

## Why not the programs clubs already use

Swiss-Manager and Vega are good, FIDE-endorsed and paid, and they run on a laptop. Swiss-Manager runs only on Windows. JaVaFo and bbpPairings are free and endorsed, but they are command-line engines: you write the TRF file yourself. Lichess and chess.com pair only games played on their own sites.

This page is free and runs in any browser. It is **not** FIDE-endorsed, and the page says so: for a rated event, use an endorsed program. For the weekly club Swiss, the replay shows how close it gets.

## The fix that changed nothing

This morning's post explained how [big Swiss brackets quietly dropped a rule](2026-11-22-big-swiss-brackets-forgot-a-rule.md). A 2^50 limit on the matching weights left no room for the last float criteria once a score group passed about 45 players. That fix covered the step that chooses who drops a score group. The same arithmetic was still in the next step, which fixes who plays whom inside the group. There, all seven criteria fitted only up to 66 paired players. Past about 200 there was room for four, and past about 500 for three.

Stage B now sizes each digit by how many players can actually trigger its rule. Then we measured whether it mattered:

- The real-event replay is identical. In the condition where the pairer also chooses who sits out, one board of 5,083 moves.
- Simulated opens of 101 to 301 players give the same repeat-float counts as before.
- We fed the same histories to the old and new builds and compared every board. Not one board differed in 96 rounds, even with 301 players and 40% draws.

So the fault was real but latent. The fields we can measure never reached a group big enough, with float histories mixed enough, for the dropped rules to change a board. We fixed it anyway, because the next field might. A fix with no measured effect gets reported as one.

The code, the tests (`swiss-page.test.mjs`) and the measurements (`eval/swiss-stage-b-radix.txt`) are in the [venture's README](../../ventures/league-schedule-generator/README.md).
