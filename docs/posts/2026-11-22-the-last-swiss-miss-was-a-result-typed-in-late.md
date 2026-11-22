---
title: "The last Swiss pairing miss was a result typed in late, and the page now checks for it"
seo_title: "A Swiss round that won't replay: find the late result"
date: 2026-11-22
tags: [league-schedule, swiss, chess, tools]
description: "One round-3 game read as a draw explains all 137 boards of the Graz round our free Swiss pairer missed. The pairing page now runs the same check on any TRF."
---

The free [Swiss pairing page](../../ventures/league-schedule-generator/swiss-pairing.html) in the league schedule generator is checked against six real chess events published on chess-results.com. Each event is replayed round by round, and our FIDE Dutch pairings are compared with the ones the arbiters published. By this afternoon every later round matched except one: round 4 of the Graz International Chess Open 2026.

The miss looked like a choice we couldn't see. In the group on 2.5 points, an odd number of players meant one had to drop to the 2-point group. The Dutch rules drop the lowest-ranked player who can go, which here was player 152. The arbiters dropped player 21, rated 2430 and tenth in the group. The group below did the same thing: they dropped 19, we dropped 274. Colours, earlier floats and every other rule we model came out level. The last write-up called it "something we do not see in the file".

## It was in the file, one round back

This time we asked a different question. What if the round was right, but it was paired on a result that is no longer the one in the file?

A short script changes one earlier game's result at a time to each of the other two outcomes. It re-pairs the round after each change and keeps any change that gives the arbiters' round exactly. On Graz round 4 it tried 516 changes, on games involving a player within half a point of the 2.5 group. One fits: round 3's game between 21 and 89, which every file records as a win for 21. Read it as a draw and the re-pairing matches **all 137 published boards, colours included**.

The mechanics check out by hand. With a draw, 21 has 2 points, not 2.5. The 2.5 group is now even, so nobody drops out of it, and 152 plays 39 inside it, as published. 21 joins the 2-point group and meets 97 there. That makes the 2-point group odd, so 19 drops out of it, as published. Round 5 replays exactly on the file as it stands, so the win was back in place by then.

We can't see the arbiters' screen on the day. The test files were all exported after the event, so each one already has the corrected results. The simplest story is that the result was entered as a draw, or not entered yet, when round 4 was paired, and fixed before round 5. Nothing in the pairer changed. On the files as published it still reproduces 51 of 54 rounds and 99.2% of later boards. With that one game read as a draw, every round from 2 on is exact in all six events.

## A second miss the old check had hidden

The replay always entered players without a published board as absent, and that includes whoever got the pairing bye. So it never compared the bye. Checking each round from the file that records it showed one: in Budapest Spring Festival group A, round 8, the arbiters gave the bye to a player on 1.5 points, while the Dutch rule gives it to one on 1 point. The only single-result explanation moves just the bye, so that one stays open.

## The same check, on the page

The pairing page now has a card called **Check a round an arbiter paired**. Open a TRF file that includes the round, from Swiss-Manager, Vega, chess-results or the page itself, and pick the round. The page re-pairs it from the rounds before it and tells you:

- how many boards match, how many of those have the same colours, and whether the bye matches;
- the boards that differ, highest score group first, with each player's score going into the round;
- if they differ, the one earlier result that would explain the whole round: "read round 3's Dehtiarov (21) – Dovgaliuk (89) as ½-½ instead of 1-0 and the re-pairing gives every board in the file."

The search runs in a background worker. On the 275-player Graz file it answers in about 13 seconds. As with everything on the page, the file is read on your device and never uploaded.

For an arbiter, it gives a second opinion on a round before it goes up, and points to the scoresheet when a result was keyed in wrong. It is not FIDE-endorsed, so a rated event still needs an endorsed program. But a mistyped result is the kind of slip a quick second look can catch.

The code is MIT licensed: `round-check.mjs` for the check, `eval/swiss-result-flip.mjs` for the full search, and every number above is in the venture's README.
