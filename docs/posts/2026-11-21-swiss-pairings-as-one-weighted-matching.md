---
title: "Swiss pairings as one weighted matching: no forbidden colours in 3,560 rounds"
seo_title: "Free Swiss pairing tool that pairs a whole round as a matching"
date: 2026-11-21
tags: [league-schedule, swiss, chess, algorithms]
description: "The free Swiss pairer now pairs each round at once with blossom matching: 0 forbidden colour boards on simulated events, against 11,457 before."
---

Chess clubs, Magic stores, darts leagues and board-game nights run Swiss events: everyone plays every round, nobody is knocked out, and each round pairs players on the same score. The rules sound simple. Nobody meets twice. Players on equal points meet. Nobody gets white three times running, or two more whites than blacks. In practice those rules fight each other, and a club volunteer with a printout finds that out at 7:40 pm.

**The old pairer worked one player at a time.** The [league schedule generator](../../ventures/league-schedule-generator/)'s Swiss card took the top player, gave that player the nearest-score opponent not yet met, then the next, backtracking when the rest could not be paired. Colours were sorted out afterwards. It never paired a rematch. But it could not weigh one board against another: to give player 1 a perfect opponent it would happily leave two players further down both owed white.

**The new one pairs the whole round at once.** Every pair who have not met is an edge in a graph. Each edge gets a weight: a large constant less a penalty. The penalty comes in tiers, each bigger than everything below it can add up to: both players owed the same colour absolutely (FIDE forbids that board; it is left out of the graph unless no round exists without it), then the score gap squared, then both players with a strong claim on one colour, then a mild claim, then the usual Dutch order (top half of a score group against the bottom half). The best round is the heaviest perfect matching, which [Edmonds' blossom algorithm](../../ventures/league-schedule-generator/blossom.mjs) finds exactly, in a few milliseconds for a club field. An odd field adds a "bye" vertex joined only to players who have not had one.

One more step mattered. A round that is best on its own can leave a small field with no fresh opponents for the next round: six players can trap themselves after round 3. So if the best round would do that, the pairer tries the best round without each of its boards in turn and keeps the best one that leaves a next round possible.

**What changed, measured.** 40 simulated events for each of 11 sizes from 8 to 151 players, 5 to 11 rounds, results drawn from rating gaps with draws, the same seeds for both pairers ([eval](../../ventures/league-schedule-generator/eval/swiss-matching.txt)):

| over 3,560 rounds | old | new |
|---|---|---|
| boards where both players were owed the same colour absolutely | 11,457 | 0 |
| boards where both had a strong claim on one colour | 25,235 | 6,264 |
| players ending an event with three of one colour running | 4,767 | 0 |
| floating boards (players on different scores) | 13,542 | 12,372 |

Played as deep as possible (every round until no rematch-free round is left, 6 to 20 players), the new pairer reached the last possible round in every event at 6, 7, 8, 10 and 16 players. The old one stopped sooner than the new one in 59 of 320 events. Without the lookahead the new pairer was no better than the old one there, which is why the lookahead is in.

**How we know the matching is right.** The blossom code is checked against brute force on 1,700 random graphs, including weights near 10^13 so the tiers stay exact. Each Swiss round in 24 small events is checked against every possible rematch-free round. The [Swiss guide](../../ventures/league-schedule-generator/how-to-run-a-swiss-tournament.html)'s worked example is recomputed from the code by a test; its round 2 now gives all six players their due colour where the old one gave two boards a clash.

**Limits.** This is not FIDE-endorsed pairing software: it does not track repeat floats or the last-round colour exception, so rated events still need an arbiter-approved program. The events above are simulated; no club has paired a real night on it yet. It is free, runs in the browser and uploads nothing.
