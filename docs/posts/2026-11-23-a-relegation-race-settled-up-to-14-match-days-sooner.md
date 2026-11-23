---
title: "Counting the points left: our clinch search now settles relegation races up to 14 match days sooner"
seo_title: "A points-supply bound for clinch and elimination search"
date: 2026-11-23
tags: [algorithms, sports, league-schedule-generator]
description: "One cheap bound, how many points the games left can hand out, cut our clinch search's nodes by 40% and proved 90.1% of real league tables in full."
---

The [League Schedule Generator](../../ventures/league-schedule-generator/)
shows a race table under the standings: who has clinched a place, who is
out, and who is still alive. Past 12 fixtures left it cannot try every
finish (3^12 is already 531,441), so it runs a branch and bound search with
a fixed budget of 20,000 nodes. If the budget runs out, it falls back to
safe bounds. A "clinched" is still never wrong, but it shows up later than
it could.

## The cut

The question behind a team's worst place is "how many rivals can finish
level with it or above it?". Our search already dropped rivals who were
settled, over the line or unable to reach it, and branched only on games
between two rivals still in doubt. It did not count the points.

Every game left between two rivals hands them at most one game's points
between them: 3 for a win in 3-1-0 scoring. Sort the rivals by how many
points each still needs, and count how many of the smallest needs those
points can cover. No finish puts more rivals over the line than that.
Twelve chasers who each need 7 points and play 24 games among themselves
share at most 72 points, so at most 10 of them get there, however the
games go. The search now prunes any branch where that count cannot beat
the best finish already found.

The bound was already in the magic-number search, which landed earlier
the same day. The race search had not been given it.

## What it did on real seasons

We replayed 18 top-flight football seasons (openfootball, CC0) match date
by match date and asked three races after every date: the title, the top
four, and safety from relegation. We ran the old and new code side by side
on the same machine:

- Wrong calls: 0 before, 0 after.
- Tables proved in full went from 87.4% to 90.1% (5,370 to 5,538 of 6,144).
- Safety races settled before the bounds alone could settle them: 88 teams,
  up from 83. That adds up to 239 match dates in total, up from 194, and
  one team was settled 14 dates early where the most before was 6. La Liga
  2022-23 alone went from 28 to 38 dates gained.
- On 39,330 search questions the search visited 40% fewer nodes
  (4,071,227 to 2,450,880), and no answer changed.

One hand-built case shows the size of the effect. Twelve chasers on 63
points, a leader on 70, and four games each left among the chasers. Without
the cut, proving that at most 9 can draw level took 379,540 nodes, far past
the budget, so the page showed the looser bound. With the cut it took 6,907.

## What did not help

We also tried the mirror bound for a team's best place: each game hands out
at least its smallest total (2 points for a draw), and a rival that stays
under the line can only absorb so many, so some rivals must go over. It is
correct, but on the real tables it saved 48 nodes out of 72,736. Those
questions were already proved in 13,108 of 13,110 cases, so we left it out.

## Not checked

We have no league's or broadcaster's published clinch dates to compare
against, and openfootball carries no point deductions. Method and numbers
are in the venture's README, "The supply cut in the race search".
