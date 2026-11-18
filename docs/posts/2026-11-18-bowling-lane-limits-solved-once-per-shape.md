---
title: "Bowling lane limits, solved once per shape: why a team's name doesn't matter to the lane rotation"
seo_title: "Bowling lane limits solved once per shape"
date: 2026-11-18
tags: [ventures, league-schedule-generator, operations-research]
description: "Bowling lane limits on hard seasons, solved by SAT once per limit shape and fitted to any league by renaming teams: 60 of 112 seasons in target became 106."
---

The [bowling page](https://marisstella.app/league-schedule-generator/bowling-league-schedule.html)
of the league schedule generator takes **lane limits**: a team that must never bowl on a pair,
such as the end pair by the wall where a bowler with a walker has no room. The page treats a limit
as a hard rule and spreads every team as evenly as it can over the pairs it may use. Earlier today
it got every team inside its fair share in 133 of 142 measured seasons. A SAT solver showed that
three of the misses, all 20 teams over 30 weeks, had a deal the search did not find.

## More search did not close them

The obvious fix was more search. I restarted the walk from the solver's stored answer for 20 x 30
with no limits, with a new random seed each time. That closed one limit in under a second, another
in 37 seconds, and the third ("one team off both end pairs") not at all in 80 restarts. A weighted
walk, the breakout trick from SAT local search, did no better. A page can't spend 37 seconds on
one schedule and still be unreliable.

## A team's name doesn't matter to the rotation

The page already carries answers a SAT solver found ahead of time for the season lengths its search
misses with no limits. Storing answers for limits looked hopeless: any team can avoid any pair, so
there seemed to be far too many cases.

There aren't, because the balance doesn't depend on names. The round robin can give any team any
slot of the circle method, since the organiser typed team names, not slots. And the lane pairs are
interchangeable as far as the counts go. So "Pin Pals avoid lanes 7-8" and "Gutter Gang avoid
lanes 1-2" are the same problem once you rename. What matters is the limit's **shape**: how many
teams avoid how many pairs, and which of them share a pair. One team off one pair is one shape.
Two teams off the same pair is another. One team off both ends is a third. A handful of shapes
covers what leagues actually ask for.

So the solver runs once per shape and season length, with the limited teams on slots 0, 1, 2. The
page then finds the renaming that maps your limits onto a stored shape (it tries every one, which
is cheap for up to four limited teams). It gives the limited teams those slots and the other teams
keep their order. Who plays whom is still a plain round robin, with every team meeting every other
as often as before, just in a different order. The answer is checked again in the browser before
it is used: every match on a pair its teams may use, and every count inside its target. If it
fails, the page runs its search as before.

## What it measured

On the 28 season lengths that were already hard without limits, I tried four kinds of limit, with
the limited teams spread over the league rather than placed on the shape's slots:

| | seasons with every team in target | counts off target | time per season |
|---|---|---|---|
| search alone | 60 of 112 | 100 | 1.9 s |
| with shape answers | 106 of 112 | 14 | 1.1 s |

The solver answered 43 of the 49 misses, in 0.4 to 199 seconds each. One is impossible (20 teams,
9 weeks, two teams off one pair), and 5 ran past a 300-second limit. Those six are what the page
still misses. On the original 142-season grid the page now gets 137, and the solver proves that
each of the other 5 can't be done at all. All 5 are 6-team leagues on 3 pairs, where two limits
don't leave enough room. The table adds 171 answers and 36 KB to the page.

There was a cost. Back-to-back repeats on the same pair rose about 4% over the grid (2,338 to
2,436), because the polish that removes repeats starts from a stored answer and may not unbalance
it. Balance comes first on this page, so I kept it.

## What's left

An impossible result covers only the slots the solver was given. With the limited team in another
slot (the circle method's fixed slot, say) there may be a deal, so the next step is to try those
slots before telling an organiser it can't be done. The five timeouts need a longer solve or a
model with the symmetries broken. The scripts and every number are in the project's `eval/`
folder (`bowling-avoid-shapes.py`, `bowling-avoid-shapes.txt`, `bowling-lane-avoid.txt`).
