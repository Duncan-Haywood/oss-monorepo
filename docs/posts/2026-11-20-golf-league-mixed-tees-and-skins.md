---
title: "Mixed tees and skins in a golf league, worked by hand"
date: 2026-11-20
tags: [ventures, league-schedule-generator, product]
description: "The free golf league page now scores players on forward tees fairly against players on the main tees, and runs a gross or net skins game with carry-over."
---

The [golf league page](https://marisstella.app/league-schedule-generator/golf-league-schedule.html)
landed this morning with a tee sheet and match play scoring. It had two gaps that most real
twilight leagues hit in their first week: some players play the forward tees, and most leagues
run skins on the side. Both are now in.

## Mixed tees

The course card takes more than one set of tees. Type the main rows as before, and add the
others by name:

```
Par (forward):   4 4 3 5 4 4 3 5 5  ...
Index (forward): 1 3 15 7 11 5 17 9 13  ...
```

A set of tees that differs only in its stroke index needs only that line. In the roster, a player
on those tees is written `Ben (forward)`.

The league handicap is strokes over par, so it has to be worked against each player's own par.
Then there is the pairing. Say Ana plays the forward tees, where the front nine is par 37, with a
handicap of 5. Cy plays the main tees, par 36, with a handicap of 2. A 5 on the forward tees
shoots about 42, and a 5 on the main tees about 41, so equal handicaps are not equal golf here.
The page does what the World Handicap System does for mixed tees, applied to a league handicap:
the player on the tees with the higher par gets the difference as extra strokes. Ana plays off 6
against 2, and her 4 strokes fall on her own card's four hardest holes, which are holes 1, 2, 6 and
4 on the forward stroke index. With her 42 against Cy's 39, each wins three holes, three are
halved, and Ana's net 36 beats Cy's 37 for the pairing's net point: 5.5 to 4.5. A test in the
project recomputes that pairing number by number.

Team net puts each player's net over their own par back onto the main tees' par. So a team's
total still reads like a familiar number, and it is fair across tees.

## Skins

Skins is an optional side game. Each hole is a skin, won by the one player with the lowest score
on it. If two or more tie for low, nobody wins it, or, with carry-over on, it rides on to the next
hole. Pick gross, net (with a share of each player's handicap, 100% by default) or both. With an
entry fee, the pot is the entry times the players, shared by the skins won. A night with no skin
won returns the entries.

On the hand-worked night from the first post, gross skins go 5 to Cy and 3 to Ana, with hole 4
tied at 5. Net skins with full handicaps tie on every hole but the 8th, which Dee wins with a net
4. That is typical. Net skins among four evenly handicapped players tie far more often than gross
skins, which is why many leagues turn on carry-over for the net game.

Players on different tees are compared by their score against their own par on the hole. When
everyone plays the same tees, that is the same as comparing scores.

## Limits

This is still a league handicap, not a Handicap Index, and it posts nothing to an association.
The mixed-tee step uses par only. Without course and slope ratings, a league cannot do the full
course-handicap sum, and most nine-hole leagues don't. Skins payouts are rounded to the cent and
shown, not handled; the money stays with the league. No real league has run a season on the page
yet, so if you run one, the cards you type stay in your browser and nothing is uploaded.
