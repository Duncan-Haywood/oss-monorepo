---
title: "One missing restriction: the free Swiss pairer now matches 46 of 48 real later rounds"
seo_title: "Swiss pairing: S1 meets S2, and 99% of real boards match"
date: 2026-11-22
tags: [league-schedule, swiss, chess, tools]
description: "Two fixes inside a score group took the free Swiss pairer from 95.9% to 99.1% of six real events' published later-round boards, 46 of 48 rounds exact."
---

This morning the free [Swiss pairer](../../ventures/league-schedule-generator/how-to-run-a-swiss-tournament.html) in the league schedule generator reproduced 95.9% of the later-round boards that arbiters published for six real chess events. The check replays each event round by round from its chess-results.com files and compares our pairings with theirs. Their programs are FIDE-endorsed. 27 of the 48 later rounds still had at least one different board.

The 27 misses had been sorted by where they first went wrong. In 25 of them both programs floated the same players down out of each score group. They only disagreed on who played whom inside a group. So we read the two smallest of those groups by hand.

## The four-line group that gave it away

Budapest Spring Festival, group B, round 7, the players on 1.5 points. One player had already floated down, and six were left to pair: 57, 63 and 66 in the top half (S1), 67, 70 and 83 in the bottom half (S2). Five of the seven wanted white. Player 63 had to have white (black twice in a row) and had already played 70.

FIDE's Dutch system tries the bottom half in a fixed order and pairs top against bottom. It takes the first arrangement that is as good on colours as any arrangement can be. Here that is 57-70, 63-67, 66-83, with one player out of colour. That is what the arbiters published.

Our pairer gave 57 its first bottom-half player, 67, because some pairing of the rest still had only one player out of colour. But that pairing put 63 against 66, two top-half players against each other. That never happens in Dutch order unless an exchange between the halves is needed, and here none was. The code that handles exchanges returned "nothing to do" when none was needed, and the step after it then allowed any board at all. Now it returns the two halves as they are, and partners come only from the other half.

That one restriction moved the replay from 95.9% to 99.0% of the boards. It explained 24 of the 25 rounds.

## The other one

Budapest group A, round 8, 5 points. A player came down from 5.5 (25) and should take the highest player in the group it can meet without hurting colours. That was 4. That choice leaves player 1 with nobody to play (1 had already met 18 and 22), so 1 floats down. Our pairer had decided who floats before placing 25. It floated 9, which forced 1 onto 4 and 25 onto 18. Now the players coming down are placed first, and they can change who floats. The change is kept only if the rest of the round loses nothing on FIDE's higher criteria.

## Where it stands

| | later-round boards | later rounds exact |
|---|---|---|
| this morning | 95.9% | 21 of 48 |
| now | **99.1%** | **46 of 48** |

Three of the six events now come out identical to the published pairings in all nine rounds. The two later rounds still off (Graz round 4 and Prague round 5) are both about who floats down, not who meets whom. On 440 simulated events of 8 to 151 players, every round still pairs. No board breaks an absolute colour rule, and repeat floats went slightly down.

It is still not a FIDE-endorsed program, so use an endorsed one for rated events. For a club night, a school league or a darts Swiss, it is free and runs in the browser. It reads and writes the TRF files the endorsed programs use. The full measurements are in the venture's [README](../../ventures/league-schedule-generator/README.md) ("Inside a bracket: S1 meets S2").
