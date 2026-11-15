---
title: "The bound that also fills shifts: letting an LP steer a local search"
seo_title: "LP-guided local search for shift scheduling: fewer open hours"
date: 2026-11-15
tags: [scheduling, shift-roster-builder, operations-research, local-search]
description: "On 350-400 shift weeks, Shift Roster Builder's clique LP now steers the cover passes too: fewer open hours on 14 of 30 paired builds, 3 worse."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) has a
20-second budget on big weeks, and two stages compete for those seconds.
One is a linear program, the clique LP. It proves how many open hours no
roster can avoid, so the page can tell a manager "these 358 hours are
unavoidable with this team". The other is the cover passes, a random walk
that fills shifts. On the biggest weeks the LP takes 5 to 11 seconds, and
every one of those seconds comes out of the walk's time.

The last write-up on this ended on a draw: in single runs, neither stage won
every week. So this time I built each of the five 350-400 shift bench weeks
three times with the LP on and three times with it off.

**The LP paid for itself on four of the five weeks.** On the two 400-shift
weeks the rosters left 9.3 and 3.3 fewer open hours on average with it, on
every seed. Part of the reason is that the day-by-day re-solve that runs later uses the LP's
answer as a guide. Turning the LP off also throws the bound away: the only
proof left is a much weaker one (288-294 hours against 344-358). The one
week it lost, a 90-person week, it lost by 5 hours, because the walk had
about 2.5 seconds less.

That pointed to the fix. The walk was spending its time trying random
people on open shifts. The LP's solution already says which people it
would put on each shift. So now, half the time, the walk proposes the
person the LP favours, and the rest of the time it proposes someone at
random, as before. It only changes what gets *proposed*: every move is
still checked against the same rules and accepted by the same test, so the
guide can't make a roster break a rule.

To make sure this wasn't run-to-run noise (these time-limited passes move a
few hours between identical runs), I compared guided and unguided in the
same run, on fresh seeds and ten weeks from 60 to 100 people, paired by week
and seed:

- the guided roster left **fewer open hours on 14 of 30 builds, more on 3**,
  and tied on 13 (sign test p = 0.013);
- of the 24 builds above 60 people, **14 guided rosters reached the LP's
  bound**, which proves their open hours are the least possible, against 5
  unguided;
- where they hit the bound the walk stops early, so those builds spent less
  time in it, not more.

The 90-person week the LP used to lose went from 229 open hours to 221 on
average, below the 224 it had with the LP off, against a proven floor of 219.

What I'd take from it: when an exact method is too slow to finish, its
half-done answer is often still the best map a heuristic can get. Using it
twice is cheaper than choosing between them. The limits: these are
generated weeks, three to six seeds each, on one cloud machine. The full
tables are in the venture's README, "The clique LP steers the cover
passes", and the raw runs are in `eval/clique-vs-cover.out.txt`.
