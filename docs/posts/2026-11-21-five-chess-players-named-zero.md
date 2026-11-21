---
title: "Five chess players named \"0\": the Swiss pairer's worst event was a name bug"
seo_title: "Swiss pairer: a duplicate-name bug explained the worst real event"
date: 2026-11-21
tags: [league-schedule-generator, swiss, chess, debugging]
description: "One real chess event matched only 53% of published Swiss pairings. The cause: five players named \"0\". The fix took six events from 89.3% to 94.8%."
---

The free [Swiss pairer](../../ventures/league-schedule-generator/how-to-run-a-swiss-tournament.html) in the league schedule generator is tested by replaying six real over-the-board chess events from chess-results.com, round by round, and counting how many of the boards the arbiters actually published it reproduces. Five events sat between 89% and 97% from round 2 on. One, a spring 2026 club event at ChessHouse, sat at 52.7%, and two of its nine rounds would not open at all.

The last two write-ups guessed attendance: the club's file has byes entered ahead of time, which might clash with the replay. That guess was wrong.

**What the file actually says.** Chess-results' export for that event leaves the name column holding a national player id. Players without one get `0`. Five players are called `0`.

The tool already handles duplicate names: when it opens a FIDE TRF file it calls the second one `0 (154)`, after their start number, so every player has a name the results box can read back. The results box, though, had a convenience for people typing scores by hand: a bracket at the end of a line is a note, as in `Hawks 3 - 2 Owls (OT)`. So the line `1013983 0 - 1 0 (154)` dropped the `(154)` and became a win for the first player called `0`.

The result: player 114 had three players' wins and 3 points after round 1, the two players whose wins were taken sat on 0, and every pairing below that was built on the wrong score table. Rounds 7 and 9 refused to open because "0" had more rounds on record than the event had played.

**The fix.** The results box now reads a line with the bracket kept first and treats the bracket as a note only when a name then fails to match. `(OT)` and `(forfeit)` still work as notes, and a team really called `Hawks (U12)` now reads correctly too. Two tests cover it, and both fail on the old code.

**What changed on the replay** (same harness, same data, nothing else touched):

| | before | after |
|---|---:|---:|
| ChessHouse, boards matched from round 2 | 52.7% | 97.5% |
| ChessHouse, rounds exactly as published | 1 of 7 readable | 5 of 9 |
| All six events, boards matched from round 2 | 89.3% | 94.8% |
| All six events, rounds exactly as published | 15 | 19 of 54 |

Every other event's numbers came out the same to the board. The full output is in `ventures/league-schedule-generator/eval/swiss-bracketed-names.txt`.

**What it means for a club.** A club that opens a Swiss-Manager or chess-results TRF with repeated names, or with names that end in a bracket, now gets the right standings and pairings. That is a bigger fix for real users than the scoring number: the bug did not throw an error, it quietly paired people on the wrong scores.

The next gap is a pairing-rule one again: which players float down from a score group so that the group after next can still be paired (FIDE's C.8 look-ahead). The pairer is not FIDE-endorsed, so a rated event still needs an arbiter-approved program.
