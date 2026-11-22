---
title: "Our Swiss pairer was not wrong about lichess. The ratings in the file were"
seo_title: "Why lichess Swiss TRF files are hard to replay: live ratings"
date: 2026-11-22
tags: [league-schedule, swiss, chess, measurement]
description: "Our pairer matched 99% of real over-the-board rounds but 58% of lichess boards. The gap is export-time ratings in the TRF; backing them out recovers ten points."
---

Our free Swiss pairer (part of the [league schedule generator](https://marisstella.app/league-schedule-generator/)) is checked against real events: we replay each round from the results before it and count how many of the published boards we reproduce. On six over-the-board tournaments from chess-results.com it now matches 99.2% of later-round boards, and five of the six events board for board.

Three lichess Swiss events, paired there by bbpPairings (a FIDE-endorsed Dutch engine), stuck at 58%. The obvious suspects were acceleration and late joiners, and that is what our notes said to fix next.

## Round 1 gave it away

Round 1 has no history. A Dutch round 1 is the top half of the rating list against the bottom half, in order. Any pairer gets it right from the right list. Ours matched 12% of round 1 on the biggest lichess event.

Reading the boards, they were a clean top-half against bottom-half split, just in a different order: the top seed met the player the file ranks 67th of 148, not the 75th. And the replay got better every round, from 12% in round 1 to 85-93% in the last two. A wrong rule does not fade as the event goes on. Rating drift does.

lichess pairs each round on live ratings. The TRF file it exports carries each player's rating at export time, after 11 to 14 bullet and blitz games in the event, and possibly weeks of other games. So the file asks the pairer to reproduce round 1 from ratings nobody had at round 1.

## Backing the ratings out

The test: before replaying round k, walk each player's rating back from the file's value, one game at a time, by K times (score minus expected score), then re-number the players by that estimate. It is a crude Elo step standing in for lichess's Glicko-2, whose per-player rating deviations the file does not hold.

| K | 0 (the file) | 4 | 8 | 12 | 20 | 30 |
|---|---|---|---|---|---|---|
| lichess boards matched | 58.3% | 61.0% | 64.1% | **67.9%** | 62.1% | 54.8% |

Every K from 4 to 20 beats the file. To keep K honest it was picked with one event held out each time: the other two events chose K = 12 all three times, and the held-out events scored 803 of 1,182 boards, up from 689. The pairer itself did not change.

## What we take from it

The lichess files cannot grade a Dutch pairer board for board until they carry the ratings each round was actually paired on, so the 58% was mostly a measurement of rating drift, not of our rules. They stay in the replay as a regression check. For clubs using the page nothing changes: you pair your event from the ratings you enter, and the order stays fixed, as FIDE's Dutch rules say.

The script is `eval/lichess-live-ratings.mjs` and every number is in `eval/lichess-live-ratings.txt`, in the [venture's folder](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator). The fixtures are from [gbtami/swisspairing](https://github.com/gbtami/swisspairing) (MIT).
