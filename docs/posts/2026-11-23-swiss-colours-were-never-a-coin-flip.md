---
title: "Our Swiss colour score said 50%. The data was unordered: the real figure is 100%"
seo_title: "Swiss pairing colours: from a void 50% to 4,358 of 4,358"
date: 2026-11-23
tags: [league-schedule, swiss, chess, tools]
description: "Checking colours against the TRF, not the unordered published lists, the free Swiss pairer gives arbiters' colours on 4,358 of 4,358 boards; byes 21 of 24."
---

For two days the check on the free [Swiss pairer](../../ventures/league-schedule-generator/swiss-pairing.html) reported one number we never managed to move. Replayed against six real over-the-board events from chess-results.com, it matched 99% of the arbiters' boards. But it gave the same player white only about half the time. Lichess events, checked the same way, showed 98% to 99%. Fifty percent is what you get by tossing a coin.

It was the data, not the pairer. The fixture files list each published board as a pair of start numbers. We had read the first number as White. But each round's TRF file, the standard export arbiters' programs write, also records who had white on every game. Read that way, the first-listed player had white on 2,283 of 4,549 boards. The lists are simply not in white-black order.

## Measured against the TRFs

Who had white in round k is in the next round's file. Scored against that, the pairer as it stood yesterday already gave the arbiters' colour on **3,937 of 3,937** reproduced boards from round 2 on. Only 84 boards missed, and they were all in one round: round 1 of the Aeroflot Open.

FIDE's Dutch rules draw the top seed's round-1 colour by lot (the "initial colour", rule E.5). Aeroflot's draw gave the top seed black. Our pairer always gave the top seed white, so it got every board of that round backwards.

## What changed

- **A setting for the drawn colour.** The page now has "Top seed's colour in round 1". Round 1 alternates down the boards from it. On a later board where neither player has a colour claim yet, such as two late entrants, it decides who gets white the way E.5 says. Before, the higher-ranked player always took white.
- **TRF files carry it.** The `XXC white1` / `XXC black1` line that bbpPairings and JaVaFo use is read when you open a file and written when you download one. If a file has no such line, the page reads the drawn colour off round 1 as it was played.
- **Board parity in round 1, not rank parity.** The two rules agree when everyone is present. They differ when someone is missing or the round was paired on a provisional list. On the two events where that happened, board parity matched 91 of 91 boards and rank parity 77.

All over-the-board colours now match: **4,358 of 4,358**. Lichess rounds 2+ went from 655 to 661 of 664. Who plays whom did not change.

## The bye, finally counted

The same replay had a blind spot. It entered everyone without a board as absent, including the player who got the pairing bye. So for most rounds, who got the bye was never compared. A new check leaves that player in and lets the pairer choose. The recipient is read from the next file, where a bye shows as a `U` result. The pairer picks the same player in 21 of 24 over-the-board rounds and 18 of 18 lichess rounds. One miss is a round paired on a provisional list. The other two, Budapest A round 8 and ChessHouse round 8, are still unexplained, and they are next.

The lesson we take is old but worth repeating: before tuning against a number, check that the number measures what it says. The full tables are in [`eval/swiss-colour-truth.txt`](../../ventures/league-schedule-generator/eval/swiss-colour-truth.txt).

The pairer is free and runs on your device. It is not FIDE-endorsed: for rated events use Swiss-Manager, Vega, JaVaFo or bbpPairings.
