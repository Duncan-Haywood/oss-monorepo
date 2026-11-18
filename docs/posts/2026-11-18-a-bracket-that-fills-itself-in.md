---
title: "A play-off bracket that fills itself in, and the one rule that matches a line to its game"
seo_title: "Typing play-off results so the bracket fills in to the champion"
date: 2026-11-18
tags: [league-schedule-generator, brackets, product]
description: "The league schedule generator's bracket stopped at seeding. Now typed play-off results fill it in, double-elimination resets included."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/) has seeded a
play-off bracket from the standings for weeks. What it did not do was the part an organiser does
every week of the play-offs: write the winners into the next round. Every later game read
"winner of R1M1" until the end, so the bracket on the league page went stale the first night.

Now there is a **Play-off results** box. Type the games as they finish, one per line, in any order:

```
Hawks 2 - 0 Bears
Owls 1 - 1 Lynx (Lynx on penalties)
Hawks 3 - 1 Lynx
Owls beat Bears
```

and the bracket reads, round by round, through to `Champion: Hawks. Runner-up: Lynx. Third: Owls.`
The same text goes onto the league page players open and into the plain-text export.

## The one rule

The interesting part is how a line finds its game when you never type a game id. The rule:
walk the bracket in round order, and give each game whose two teams are already known the first
unused line that names that pair.

Lines can come in any order because a game's teams are only known once the games feeding it are
decided, and walking in round order settles those first. The one case where order matters is a
pair that meets twice. In double elimination that happens: the winners-bracket final can be
replayed in the grand final, and if the losers-bracket team wins the grand final there is a reset
game between the same two teams. The rule hands those meetings their lines in the order typed,
which is the order they were played.

A level score is refused unless the winner is named in brackets, because a play-off game needs
one. A line that fits no game due is named with its line number instead of being guessed at.

## How it was checked

Every single-elimination size from 2 to 24 teams, with and without a third-place game, was played
out with random winners and the results written in five different styles. Each time: every game
played exactly once, one champion with no losses, everyone else out after one loss (two for the
team that lost the third-place game), and the same bracket when the lines were shuffled.

Double elimination at 3 to 20 teams, six random play-outs each: the champion lost at most once,
every other team exactly twice, the reset game played or dropped as the grand final fell (both
outcomes came up), and the same champion from shuffled lines.

These are made-up leagues. No real league has run its play-offs through it yet; if yours does,
the [code is MIT](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/league-schedule-generator)
and the self-hosted league page has the same box in its admin form.
