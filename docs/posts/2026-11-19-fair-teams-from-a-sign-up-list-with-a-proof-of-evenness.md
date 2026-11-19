---
title: "Fair teams from a sign-up list, and a page that says when they cannot be fairer"
seo_title: "Balanced team generator by skill for coed and rec leagues"
date: 2026-11-19
tags: [ventures, league-schedule-generator, product, optimization]
description: "Paste players with a rating and get teams with even sizes, an even coed split and friend requests kept, plus a floor that shows when no split is fairer."
---

Every rec, coed and "hat" league starts the same way: a spreadsheet of names, a column of guessed
ratings, and an organiser dragging rows between teams until the totals look close. Then a captain
asks why their team has two women and the other has four, or why the two best players ended up
together. Random team pickers ignore skill. Sorting by rating and dealing round (a snake draft) does
better, but it can't keep friends or carpools together, can't split two rivals, and has no way to tell
you whether a fairer split exists.

The [League Schedule Generator](https://marisstella.app/league-schedule-generator/) now has a
[balanced team generator](https://marisstella.app/league-schedule-generator/balanced-teams.html) that
does that draft first. Paste `Name, rating, tag` lines straight from the sign-up sheet, add
`together: Ana, Ben` or `apart: Cy, Dee`, choose how many teams, and it:

- keeps team sizes within one of each other;
- splits every tag as evenly as the numbers allow (F and M for a coed league, G for goalies);
- keeps together groups whole and apart pairs split, or tells you which request couldn't be kept;
- inside those rules, gets the strongest and weakest team totals as close as it can.

## The part a spreadsheet can't do: a floor

A shuffle can only tell you what it found. This page also works out a floor that no split can beat.
If whole-number ratings add up to 46 across 3 teams, some team has to be at least one point ahead of
another. If one player is stronger than the rest of their team's share put together, that forces a
gap too. For lists of up to 16 players it simply tries every split. When the answer reaches the floor,
or every split was tried, the page says **proved the most even possible**. When it doesn't, it shows
the floor, so you can see how much closer any split could get.

## How well it does

On 420 random invented lists of 8 to 16 players (ratings 1 to 5, about 40% tagged F, a few random
requests), 3 had no split that kept every rule. On the other 417 the tool matched the least gap an
exhaustive search finds, with no rule broken. The swap search alone, before the exhaustive check,
matched 413 of the 417, which is why that check ships for small lists. With 40, 80, 120 and 200 players
it reached its own floor in a third of a second or less. At 400 players in 32 teams it stopped at a gap
of 2 against a floor of 1, and the page says so. The script and its output are in the repository
(`eval/balanced-teams-exact.mjs`).

## Then schedule them

"Build a schedule for these teams" opens the schedule builder with the team names already filled in,
so the draft runs straight into a round robin with dates, courts, home and away and blackouts.
Everything runs in the browser. Names and ratings are never uploaded, and there's no sign-up.

A balanced sheet is only as good as the ratings typed into it. Treat it as a starting point and swap
two players by hand if you know something the numbers don't. Next: two tags at once (one goalie *and*
two women per team), and placing late sign-ups onto teams that already exist.
