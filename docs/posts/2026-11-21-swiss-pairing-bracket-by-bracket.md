---
title: "Pairing Swiss rounds bracket by bracket: from 60% to 89% of real arbiters' boards"
seo_title: "Free Dutch-system Swiss pairing program, checked on real events"
date: 2026-11-21
tags: [league-schedule, swiss, chess, tools]
description: "The free Swiss pairer now pairs one score group at a time, as FIDE's Dutch system does, and reproduces 89% of real events' published boards, up from 60%."
---

Earlier today we replayed six real over-the-board chess events through the free [Swiss pairer](../../ventures/league-schedule-generator/how-to-run-a-swiss-tournament.html) in the league schedule generator, round by round, and counted how many of the boards the arbiters actually published it reproduced. The answer was 59.5% from round 2 on. That is not good enough for a club that wants to check its own pairings, or carry on an event started in Swiss-Manager.

**Why it was stuck there.** The pairer built each round as one weighted matching: every pair of players who had not met was an edge, and the round with the smallest total penalty won. That handles rematches, colours and floats well. But it weighs everything against everything, so a slightly cheaper colour fix at the bottom of the table could move a board at the top. FIDE's Dutch system never does that. It settles the top score group first, then the next one, and it only asks the rest of the round to stay pairable.

**What changed.** The pairer now works the same way, one score group ("bracket") at a time:

1. A matching over everyone still unpaired decides who is paired inside the bracket and who floats down. Boards inside the bracket come first, then score differences, then pairs for the floaters in the next bracket, then colours and repeat floats. Because the matching covers everyone left, a choice that would make the lower groups unpairable is never made.
2. On the players paired in the bracket, it finds the best colour result it can get and keeps it. Then it fixes partners one top-half player at a time, from the top: each one takes the earliest bottom-half player that still allows that colour result. That is the Dutch system's "S1 against S2 in order, transpositions before exchanges", done with matchings instead of trying every permutation.
3. Players who floated down head the next bracket and meet its top residents first, as the rules say.

**Measured on the same real events** (published pairings from chess-results.com and lichess.org, collected by the open-source [swisspairing](https://github.com/gbtami/swisspairing) project). We wrote the pass/fail rule down before scoring:

| from round 2 on | before | now |
|---|---:|---:|
| boards reproduced, three held-out events | 57.8% | 80.9% |
| boards reproduced, all six events | 59.5% | 89.1% |
| rounds reproduced exactly (of 54) | 5 | 15 |
| boards reproduced, three lichess events | 52.1% | 59.0% |

At the Aeroflot Open, rounds 1 to 5 now come out board for board as the arbiters published them, and at Prague, rounds 1, 3 and 4. On 440 simulated events (8 to 151 players) not one round failed to pair. A 357-player round takes about a second in the browser.

**One honest caveat about the numbers.** The first full run showed every event, the held-out ones too, and a bug made 35 rounds fail to pair. Fixing it (players left over after an exchange were never paired) was a completeness fix, not a tune, but it came after we had seen those events. The [write-up](../../ventures/league-schedule-generator/eval/swiss-bracket-dutch.md) lists every change and when it was made.

**What it still is not.** It follows the Dutch procedure closely but not to the letter. The exact order of exchanges and the look-ahead to the bracket after next are approximated, and one event (a small club Swiss) still matches only 53% of later boards. FIDE-rated events must be paired with an endorsed program. For club nights, school events, Magic or board-game leagues, and for checking what your arbiter's software did, it is free, needs no account, and runs on your own device.

[Pair your next round](../../ventures/league-schedule-generator/index.html), or open a TRF file from Swiss-Manager or Vega and carry the event on.
