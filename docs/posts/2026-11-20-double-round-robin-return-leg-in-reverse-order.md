---
title: "A double round robin with a third fewer back-to-back home games: play the return leg backwards"
seo_title: "Double round robin: fewer home/away breaks with a reversed leg"
date: 2026-11-20
tags: [ventures, league-schedule-generator, product]
description: "Reversing the return leg of a home-and-away season cuts back-to-back home or away games from 3(n-2) to 2(n-2). Measured for 4 to 20 teams, with the cost."
---

Most free schedule makers build a home-and-away season the same way. They write the first half,
then play it again with every venue swapped: round 1 with the hosts flipped, then round 2, and so
on. Ours did too.

That second half has a seam. A team that ended the first half at home starts the second half
with round 1 replayed, and nothing links round 1 to the last round. So many teams get two home
games in a row, or two away games in a row, right at the halfway line. Schedulers call each of
those a *break*. Over a season they add up to 3(n-2) for n teams: 12 at 6 teams, 54 at 20.

The fix is old and simple. Play the return leg's rounds in reverse order. The last round of the
first half is then followed by the same games with the venues swapped. Every team flips from home
to away, or away to home, across the seam, so the seam adds no breaks.

## What it changed

We measured the free [league schedule maker](https://marisstella.app/league-schedule-generator/)
on 4 to 20 teams (`ventures/league-schedule-generator/eval/reverse-leg.txt`):

| teams | breaks, mirrored | breaks, reversed |
|---|---|---|
| 6 | 12 | 8 |
| 12 | 30 | 20 |
| 20 | 54 | 36 |
| 5 | 3 | 0 |
| 19 | 17 | 0 |

Even leagues go from 3(n-2) to 2(n-2), a third fewer. Odd leagues, where the bye already resets
each team's run, go to none at all. No team has more than two breaks in an even league.

## The cost

The teams that met in the last round of the first half meet again the next week. On a weekly
league the shortest gap between a pair's two games drops from n-1 weeks or more to one week. Some
leagues don't mind. Others hate a rematch straight away, for good reason. So it is an option, a
checkbox under "Double round robin", not the new default. The rematch report under every
schedule shows the gap, so an organiser can see the trade before sending the schedule out.

Each pair still plays once at each ground, and the schedule's independent checker passes for
every size we tried. If "spread who you meet next" (carry-over) is also on, its search picks its
own second leg, so the reversed order isn't applied and the page says so.

The option is in share links and in the self-hosted league page's admin form. The code is MIT
licensed: `roundRobin(n, { double: true, reverseLeg: true })` in `calc.mjs`.
