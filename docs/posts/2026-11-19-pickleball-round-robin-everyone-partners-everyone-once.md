---
title: "A rotating-partner night where everyone partners everyone once: whist designs in the Americano builder"
seo_title: "Pickleball round robin: partner everyone once, face everyone twice"
date: 2026-11-19
tags: [ventures, league-schedule-generator, product, algorithms]
description: "The free Americano builder now uses whist designs: every pair partners exactly once and faces each other exactly twice. Where it helps, and where it doesn't."
---

A rotating-partner night (an Americano, or a "pickleball round robin" at most clubs) promises
everyone a new partner every round. The organiser's sheet should do two things: nobody gets the same
partner twice, and nobody spends the evening facing the same strong pair.

The [league schedule generator](https://marisstella.app/league-schedule-generator/) had an Americano
card that built the sheet one round at a time with a seeded search. It worked fine for small
groups. Run all the way through a full cycle, with a court for every four players, here is what it
did (`eval/whist-vs-greedy.txt` in the venture):

| Players | Courts | Rounds | Repeat partners | Times one pair meets as opponents |
|---|---|---|---|---|
| 16 | 4 | 15 | 0 | 1 to 4 |
| 20 | 5 | 19 | 2 | 1 to 4 |
| 24 | 6 | 23 | 4 | 1 to 4 |
| 28 | 7 | 27 | 6 | 0 to 4 |
| 32 | 8 | 31 | 15 | 0 to 4 |

Some pairs faced each other four times and others never met at all.

## The design card players worked out first

Whist clubs had the same problem in the 1890s, with partnerships at card tables. The answer is
called a **whist tournament**: rounds of tables (a and b against x and y) in which every pair of
players partners exactly once and plays against each other exactly twice. One exists for every group
of 4k or 4k+1 players.

Most of them can be built from a single round. For 13 players, number them 0 to 12. Find one round
of three tables, with player 0 sitting out, such that the partner differences (mod 13) hit every
non-zero number exactly once and the opponent differences hit each one exactly twice. Then add 1 to
everyone for round 2, 2 for round 3, and so on. All 13 rounds inherit the property. For 4k players
there's an extra fixed player who never moves.

The venture's search (`eval/whist-search.mjs`) is a randomised backtracking search over those
difference counts. It found base rounds for 4, 5, 8, 12, 13, 16, 17, 20, 21, 24 and 25 players in
seconds, and 28 to 37 and 44 in between half a minute and 19 minutes each (40, 41, 45, 48 and 49 found nothing in 25 minutes, so they keep the old search). 9 players has no base round mod 9 (the search
exhausts it), so it uses the group Z3 x Z3 instead. Every stored base is developed and checked pair
by pair before it is kept.

## What changed on the page

- **4k or 4k+1 players, a court for every four:** the sheet is the whist design. 16 players on 4
  courts play 15 rounds. Everyone partners all 15 others once and plays against each of them exactly
  twice.
- **7, 11, 15, 19, 23, 27 players:** the next design up with one empty seat. The table holding it
  sits out that round. Games per player are the same as before, partners never repeat, and every
  pair meets once or twice instead of anywhere from 0 to 4 times.
- **Fewer courts than tables** (20 players on 3 courts): the design still works if you deal its
  games into rounds of three, but it then takes 32 rounds, not 20. The page tells you the number, and
  if you type it into Rounds you get the guarantee.

## Where it doesn't help

Two cases, measured and left as they were:

- **6, 10, 14, 18, 22 players.** Two empty seats idle a court too often. At 18 players everyone
  would lose 2 or 3 games over the evening, so these stay on the round-by-round search.
- **A short night.** On 6 or 8 rounds the two methods tie: no repeat partners and nobody meeting
  more than twice, at 12 to 28 players over 20 seeds. At 28 players over 6 rounds the old search was
  slightly better. So for a short night the builder now makes both sheets and keeps the better one.

The design pays off over a full cycle. That means a social league that rotates partners over several
weeks, a long club night, or an organiser who wants to tell players "you will partner everyone once"
and know it's true.

It's free and runs in the browser, with nothing uploaded. Paste the names into the
[builder](https://marisstella.app/league-schedule-generator/) and use the Americano card. The
[guide](https://marisstella.app/league-schedule-generator/how-to-run-an-americano-tournament.html)
has an 8-player worked example. The tool builds the sheet. It does not keep score or rate players.
