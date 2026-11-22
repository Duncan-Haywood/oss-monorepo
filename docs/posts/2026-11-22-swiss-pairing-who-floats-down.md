---
title: "Who floats down in a Swiss round: matching the arbiters' programs on 96% of boards"
seo_title: "Swiss pairing: choosing downfloaters the Dutch way (free)"
date: 2026-11-22
tags: [league-schedule, swiss, chess, tools]
description: "The free Swiss pairer now picks the players who float down in FIDE Dutch order. It reproduces 95.9% of six real events' published boards, up from 94.8%."
---

When a score group in a Swiss event has an odd number of players, or players who have already met, someone has to float down to the next group. FIDE's Dutch rules say which player. Get it wrong and every board below that group comes out different.

The free [Swiss pairer](../../ventures/league-schedule-generator/how-to-run-a-swiss-tournament.html) in the league schedule generator is checked by replaying six real over-the-board events from chess-results.com round by round and comparing its pairings with the ones the arbiters published. Their programs are FIDE-endorsed. Yesterday it reproduced 94.8% of the later-round boards.

**Finding where the misses start.** A new script takes each round that differs and finds the highest score group with a different board. It then asks one question: do the two pairings already disagree about who floats down from that group? Of 33 differing rounds, 12 started with a different floater. Reading those groups by hand turned up three causes:

1. **The floater's colour in the next group counted.** The pairer preferred to float a player who would get their colour against someone one group down. The Dutch rules judge a downfloater only by the pairs and score gaps it leaves the next group. Who gets white down there is that group's business. Graz, round 9: three players on 7 points, all due white. The arbiters floated the lowest one. The pairer floated the middle one, because that player suited someone on 6.5 better.
2. **The wrong players were treated as the rest of the group.** A player moved down from above usually meets the top resident of the group. When a rematch stopped that, the pairer still split the leftover players as if that meeting had happened.
3. **A rough ordering chose the floaters.** In the rules, nobody picks the floater directly. The top half takes the earliest bottom-half opponents it can, and whoever is left at the bottom floats. If that cannot reach the best colours, swaps between the halves are tried in a fixed order first. The pairer now replays exactly that. It keeps the result only if the rest of the round still pairs as well as before.

**Result.** On the same six events, 4,742 of 5,083 published boards now match, 95.9% of later-round boards, and 25 of 54 rounds come out exactly (19 before). No event got worse. On three lichess events, paired by bbpPairings, the gain is 2 to 5 points each. After the change, the floater is the first difference in 2 of the 27 rounds that still differ. The other 25 float the right players and differ in who meets whom inside a group, so that is the next thing to fix.

Use an arbiter-approved program for FIDE-rated events. For club nights, school events and online leagues, the pairer is free, runs in the browser and reads and writes TRF files. Measurements: `ventures/league-schedule-generator/eval/swiss-dutch-floaters.txt`.
