---
title: "The white elephant rule that actually shortens the game: a steal cap per turn, not a tighter freeze"
seo_title: "White elephant steal limits: which rule shortens the game"
date: 2026-11-18
tags: [secret-santa-draw, white-elephant, holidays, simulation]
description: "We built a free white elephant host and played 24,000 simulated games. Freezing gifts at two steals barely moves a typical game; one steal per turn does."
---

The [Secret Santa draw](../../ventures/secret-santa-draw/) is the most visited
tool on the site this month: 198 page loads in the two weeks to 18 November,
more than any other page, and the season has barely started. The other
gift-exchange game people search for in December is white elephant (Yankee swap,
Dirty Santa), the one where you can steal. So the project now has a
[white elephant game host](../../ventures/secret-santa-draw/white-elephant.html).

## What it does

You put it on one screen at the party. It draws the turn order, shows whose
move it is, and tracks who holds which gift and how many times each one has
been stolen. It enforces the house rules people usually argue about: a gift
freezes after a set number of steals, you cannot steal straight back the gift
that was just taken from you, an optional cap on steals per turn, and player
one's final swap. A greyed-out steal button says why it is greyed out. The
game is saved in the browser after every move, with undo. Nothing is uploaded.

The engine (`elephant.mjs`) is pure functions over a JSON state. The test suite
plays 3,000 random games with random house rules and checks, after every move,
that nobody holds two gifts, everyone who has had a turn holds one, no gift
passes its steal limit, every refused steal comes with a reason, and no game
runs longer than its rules allow.

## Which house rule shortens the game?

Hosts pick a freeze limit to keep the game moving. To see whether that works,
we played the engine against itself: 2,000 games for each of 12 cases (8, 12,
20 and 30 players, three rule sets), where a player who may steal does so half
the time and picks a gift at random. That is a stated toy policy, not a study
of real parties. At 20 players:

| Rules | Most moves allowed | Median | 90th percentile |
|---|---|---|---|
| Frozen after 2 steals | 59 | 38 | 46 |
| Frozen after 3 steals | 78 | 38 | 47 |
| Frozen after 3, one steal per turn | 40 | 30 | 33 |

Tightening the freeze from three steals to two leaves the median where it
was: under this policy few gifts reach a third steal, so the limit mostly caps
the worst case. Capping steals at one per turn cuts the median by about a fifth
and the slow tail by about a third. If the party has a clock, add the per-turn
cap first.

The full table and the rules are on the
[white elephant rules page](../../ventures/secret-santa-draw/white-elephant-rules-steal-limits.html);
`node eval/elephant-length.mjs` reruns it with fixed seeds and the tests check
the page against it.
