---
title: "Late sign-ups onto teams you already announced, without reshuffling everyone"
seo_title: "Adding late sign-ups to balanced rec league teams"
date: 2026-11-19
tags: [league-schedule-generator, rec-leagues, team-balancing]
description: "The balanced team generator now places late sign-ups onto announced teams. Letting two players switch closes most of the gap a full redraft would."
---

A rec league posts its teams on Monday. On Wednesday three more people pay.
The organiser now has two bad choices: put each newcomer on the smallest team
and hope it evens out, or redraft everyone and tell people who already met
their teammates that they've moved.

The [balanced team generator](https://marisstella.app/league-schedule-generator/balanced-teams.html)
now covers that Wednesday. You paste the teams you announced (the CSV the page
downloads, or any sheet with `Team, Player, Rating, Tag` columns), then type
only the new players. The page keeps every announced player on their team,
keeps the team names and their order, and places the newcomers under the same
rules as the first draft: team sizes within one, each tag split evenly,
`together` and `apart` requests kept. Inside those rules it makes the gap
between the strongest and weakest team as small as it can. A `drop: Name` line
takes out someone who left.

It also has one setting the organiser decides on: **how many announced players
may switch teams.** The default is 0. If you allow 1 or 2, the search may move
that many, picks the fewest moves among equally even answers, and names each
one ("Moved: Gus from Lynx to Hawks") so you know who to message.

## What the measurements say

The new script `eval/late-signups.mjs` drafts teams from an invented list,
adds 3 to 12 late players, and compares three approaches. The first is the
least-filled rule a person would use by hand: smallest team first, ties to the
weaker team. The second is the new placement with nobody moved. The third is
the new placement with up to 2 players moved.

- **With nobody moved, the gain is in the rules, not the gap.** In every case
  where least-filled kept the coed and goalie split, the new placement matched
  its average gap exactly. But least-filled left one team with two more women,
  or two more goalies, than another in 7 to 22 of 40 small cases. At 80 players it did so in 15
  of 20 cases, and at 160 in 10 of 10. The new placement kept the split in all
  of them.
- **Two moves get you almost a redraft.** At 9 to 12 players the average gap
  fell from about 2.0-2.5 rating points to 0.65-0.72, against 0.65-0.70 for a
  full redraft of everyone, moving about one player on average. At 40 players
  it fell from 2.50 to 0.87 (redraft: 0.80).
- **Where it runs out.** With 12 late players spread over 16 teams of 10, two
  moves are not enough (4.40 to 3.60, while a redraft reaches 0.80). A big late
  wave is a reason to allow more moves, or to redraft.

On lists of up to 16 players the page also tries every placement with the
announced players pinned. The search alone matched that on 95 of 95 small cases.

## Two tags per player

The same update lets one player carry two tags: `F G` (or `F/G`) for a woman
who keeps goal. Each tag is split evenly on its own, so every team gets its
share of women and its share of goalies at the same time. Before, an organiser
had to pick one or the other.

## Limits

Ratings are whatever the organiser types, so "even" is only as good as those
numbers. If the announced teams already have an uneven split and no moves are
allowed, the page names the team that is off rather than quietly fixing it.
The numbers above come from invented lists, not a real league's sign-ups.

Everything runs in the browser. Names and ratings are never uploaded. The
engine is `teams.mjs` in the
[league schedule generator](https://marisstella.app/league-schedule-generator/),
MIT licensed.
