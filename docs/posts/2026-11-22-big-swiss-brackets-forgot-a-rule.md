---
title: "Big Swiss brackets quietly forgot a rule: 51 players left no room for it"
seo_title: "Swiss pairing: why big score groups forgot FIDE C.16"
date: 2026-11-22
tags: [league-schedule, swiss, chess, tools]
description: "A 50-bit weight limit dropped a FIDE float rule from Swiss brackets over about 45 players. Sizing each digit fixed Prague: 47 of 48 real rounds now match."
---

The free [Swiss pairer](../../ventures/league-schedule-generator/how-to-run-a-swiss-tournament.html) in the league schedule generator is checked against six real chess events. It replays each one round by round from the chess-results.com files and compares its pairings with the ones the arbiters published. This morning 46 of the 48 later rounds matched exactly. Both misses went wrong first on the same question: which player drops down a score group.

## The Prague miss

In round 5 of the Prague festival's D group, 52 players sat on 1 point and one player dropped in from above, so one of them had to drop to the group below. The arbiters dropped player 332. We dropped 355.

Both choices gave every board in the group the same colours. So the next rule in the FIDE Dutch system decides it: avoid dropping a player who dropped two rounds ago (criterion C.16). Player 355 had a bye in round 3, and a bye counts as a drop. The arbiters' choice follows the rule. Ours did not.

## The cause was arithmetic

The pairer turns each group into a weighted matching problem. Each possible board gets one integer weight, with the FIDE criteria packed into it like digits in a number. Colours are the high digits, and the float rules sit below them. The weights have to stay under 2^50 so the matching code's arithmetic stays exact.

Every digit had been given room for one more value than the number of players. With 51 players that is base 52, and only five of the seven digits fit under 2^50. So the last two rules, C.16 and C.17, were dropped without any warning. That happened in every group of more than about 45 players. Small events never saw it, and big opens always did.

## The fix

A digit only needs room for the largest total it can actually reach. If only two players in the group dropped two rounds ago, the C.16 digit can never be more than 2, so it needs 3 values, not 52. The new `lexRadix` function counts which players can trigger each rule and sizes each digit from that. All seven digits now fit in the Prague group.

On the replay:

- Prague now matches the published pairings in all nine rounds.
- The six events together match 47 of 48 later rounds exactly, up from 46.
- Boards matched rose from 4,890 to 4,892 of 5,083.
- Small events are unchanged, as expected: their digits always fitted.

## The round we left alone

Graz round 4 still differs. In the 2.5-point group the arbiters dropped player 21, rated 2430 and tenth in the group. We drop 152, the last player in it. We wrote a small checker that counts unmet colour claims on the boards touching a group. Both pairings score the same: two boards where both players wanted one colour, one of them a strong claim. Both dropped players want black, and neither has dropped in the last two rounds. On every rule we model the two choices tie, and then the Dutch order drops the last player.

So the published choice comes from something the file doesn't show us: a rule further down the round, or an arbiter's change by hand. We have recorded it as open rather than bend the pairer to fit one round.

The code, the replay output (`eval/swiss-big-brackets.txt`) and the colour checker are in the [venture's README](../../ventures/league-schedule-generator/README.md).
