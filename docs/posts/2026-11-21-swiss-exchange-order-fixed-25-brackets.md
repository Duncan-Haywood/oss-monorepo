---
title: "Following FIDE's exchange order to the letter fixed 25 brackets out of 975"
seo_title: "Swiss pairing: FIDE Dutch exchange order, measured on real events"
date: 2026-11-21
tags: [league-schedule-generator, swiss, chess, algorithms]
description: "Our Swiss pairer now swaps players between halves in FIDE's exact order. Real chess events: 89.1% to 89.3% of boards, no round worse, and why the gain is small."
---

Earlier today [the Swiss pairer started pairing score brackets one at a time](2026-11-21-swiss-pairing-bracket-by-bracket.md), the way the FIDE Dutch rules do. Replayed against six real chess-results events, it reproduced 89.1% of the boards the arbiters published after round 1. The write-up named the next suspect: the exchange order.

**What the rule says.** In a score bracket the top half (S1) plays the bottom half (S2). If no reordering of S2 gives a legal pairing at the best colour and float quality, the rules swap players between the halves, in a fixed order: the fewest swapped first, then the smallest difference between the pairing numbers moved each way, then moving the highest number out of S1, then the lowest out of S2. After the swap, the new S1 plays only the new S2.

Our pairer only approximated this. When a top-half player had no bottom-half partner left, it offered other top-half players, starting at the middle. That can end with two bottom-half players paired together, which no Dutch candidate ever does.

**The fix.** [`exchangeFor`](../../ventures/league-schedule-generator/swiss.mjs) runs one matching to find the best quality and the fewest top-half-against-top-half boards that quality needs. That number is the size of the smallest swap. It then tries swaps of that size in the rules' order, checking each with a matching that allows only new-S1-against-new-S2 boards, and keeps the first that reaches the best quality. A unit test builds six-player cases for the second and third sort keys, where the old rule and the new one pick different swaps.

**What it bought, nothing tuned** ([eval note](../../ventures/league-schedule-generator/eval/swiss-exchange-order.md)):

| | before | exchange order |
|---|---|---|
| chess-results boards matched | 4,290 of 4,915 | 4,297 |
| later-round recall | 89.1% | 89.3% |
| Budapest B, round 7 | 74% | 84% |
| lichess boards matched | 636 of 1,182 | 640 |

No round of any event got worse, and the 440 simulated events still all pair.

**Why so small.** Only 25 of the 975 brackets in the replay needed a swap at all, and each needed just one. The rule was a real deviation, but a rare one. Most of the remaining 10.7% comes from earlier decisions: which players float down to the next bracket (FIDE looks ahead to the bracket after next) and which moved-down players get paired.

**A null result worth writing down.** FIDE counts any unmet colour preference (criterion C.12) before an unmet strong one (C.13). Our pairer ranked strong clashes first. Swapping to FIDE's order changed **zero** boards across all nine events, so it didn't ship. The next run doesn't need to try it.

The pairer runs in the browser in the [league schedule generator](../../ventures/league-schedule-generator/README.md), opens and writes FIDE TRF files, and is free and MIT licensed. It is not FIDE-endorsed: rated events still need an endorsed program.
