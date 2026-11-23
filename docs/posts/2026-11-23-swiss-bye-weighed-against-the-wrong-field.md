---
title: "A Swiss bye went to the wrong player because its weight was measured against 170 players, not 7"
seo_title: "Swiss pairing bye: weighed in its bracket, 22 of 24 rounds"
date: 2026-11-23
tags: [league-schedule, swiss, chess, tools]
description: "One Swiss bye miss came from a weight scaled to the whole field. Scaled to its bracket, the free pairer gives the arbiters' bye in 22 of 24 real rounds."
---

Our free [Swiss pairing page](../../ventures/league-schedule-generator/swiss-pairing.html) is checked against six real over-the-board events from chess-results.com. Earlier today it gave the pairing bye to the same player as the arbiters in 21 of 24 rounds. One of the three misses was round 8 of the Spring 2026 ChessHouse event. The arbiters gave the bye to start number 160. We gave it to 128.

## Not a late result

The first thing we suspect in a miss like this is a result typed in after the round was paired. That explained a whole round at Graz last week. Here, no single earlier result read another way explained it. So we tried something blunter: we barred 128 from the bye and paired again. Every one of the 84 boards then matched, and 160 got the bye. The pairer could find the arbiters' round. It just preferred another one.

## Two rounds that look equally good

The last score group had seven players on one point. One player who had floated down from above took one of them. That left five: 128 and 153 in the top half, 155, 158 and 160 in the bottom half. 128 had already played 155. 128, 158 and 160 all strongly wanted white. So every pairing that kept the two halves as they were gave somebody a strong colour clash. FIDE's Dutch rules then allow an exchange, moving one player from each half to the other.

Two exchanges give rounds with the same colour quality: one mild colour miss each, and no repeated floats.

- Swap 153 and 158. That gives 128-153, 158-155 and the bye to 160. This is what the arbiters did.
- Swap 128 and 155. That gives 158-153, 160-155 and the bye to 128. This is what we did.

Both swaps cover the same gap in seed numbers. When that happens, the Dutch rules prefer swapping the lower-placed of the top-half players, which is 153. So the arbiters were right.

## The weight

Our pairer turns the Dutch rules into weights and finds the best matching. The bye carries a small charge for how far its player sits from the bottom, so the lowest-ranked player gets it when nothing else decides. That distance was divided by the size of the whole field, 170 players. Five places up a seven-player bracket cost 29 points. The board costs it had to beat ran from 0 to 700. The bye was nearly free, and the cheapest way to pair the rest won.

The fix measures the distance from the bottom of the bracket, on the same scale as the board costs. Giving the bye to 128 now costs 833, and the arbiters' round comes out cheaper (1,400 against 1,683).

## What moved

- **Byes:** 40 of 42 rounds across all nine events now give the same player the bye, up from 39. Over the board, it is 22 of 24.
- **Boards:** unchanged. 51 of 54 over-the-board rounds still match exactly when the pairer is given the players who actually played.
- **One round got worse in a check that does not use the real field.** That check also seats players who missed the round. For Budapest B round 4 it seats four players the arbiters left out, and its bye now differs. With the real field the round still matches exactly.

The full before-and-after table is in [eval/swiss-bye-bracket.txt](../../ventures/league-schedule-generator/eval/swiss-bye-bracket.txt). A new test builds an 11-player event with the same shape. The old weight fails it.

Two over-the-board misses remain. One is a round paired from a provisional list. The other is Budapest A round 8. There, the player who got the bye had more points than the player we chose, so no bye rule picks that player. One earlier game read as a win instead of a draw explains it. The page's "Check a round" already says so when you open that file.

The pairer is free and runs in your browser. It is not FIDE-endorsed. For rated events, use Swiss-Manager, Vega, JaVaFo or bbpPairings.
