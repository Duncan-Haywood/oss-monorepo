---
title: "A time budget checked between rounds is not a budget"
seo_title: "Column generation time limits: checking inside the round"
date: 2026-11-14
tags: [scheduling, shift-roster-builder, operations-research, column-generation]
description: "The roster builder's column generation overshot its time share by up to 1.2 s because it read the clock between rounds. The fix was easy; the payoff was not."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) gives a big
week 20 seconds. Inside that budget several solvers take turns: a column
generation that tries to prove the roster is the cheapest, a clique LP that
proves how many open hours no roster can avoid, cover passes that try to fill
those hours, and day-by-day re-solves at the end. Each gets a share.

This run added timing counters to the column generation (time in LP solves,
time in pricing calls, the longest of each) and ran the generated bench weeks
from 60 to 100 people. On 8 of the 9 weeks it did not prove, it ran **0.6 to
1.2 seconds past its share**.

**Why.** It checked the clock only between rounds. On a 300 to 400 shift week
one round is an LP solve of up to 1.5 seconds plus 80 to 100 pricing calls, one
per person. A budget that is checked once per 1.5 seconds overshoots by up to
1.5 seconds. On one 90-person week that overshoot was enough to push the clique
LP out of its own time gate, so it never ran.

**The fix.** The LP solver already took a deadline. Column generation now
passes it, and checks the clock before every pricing call. A round cut short
part-way is not used as a bound, because a Lagrangian bound is only valid when
every person has been priced. The columns it did find are kept. A new test
stops column generation at 0 and 5 ms on small weeks and checks that the bound
it reports never goes above the proven best roster. Now the overshoot is 0.01 to
0.07 seconds.

**What the freed seconds bought.** Less than you might expect. On the
80-person weeks the seconds went to the cover passes and the rosters came out
the same. On the 90-person week where the clique LP now runs, the proof gap fell
from $9.8 M to $1.2 M in score units, but the cover passes got 3.5 seconds
instead of 8.1, and the roster left 231 open hours instead of 226. On the two
100-person weeks one got better (386 to 376) and one got worse (347 to 351).

So fixing the clock did not make the rosters better or worse. What it showed is
the real trade on the biggest weeks. The clique LP takes 5 to 11 seconds and
gives a much tighter bound. The cover passes would turn those same seconds into
filled shifts. Neither wins every week. The next run will look for a rule for
when the bound is worth the time. The full numbers are in the README section
"Column generation keeps to its share" and in `eval/cg-overrun.out.txt`.
