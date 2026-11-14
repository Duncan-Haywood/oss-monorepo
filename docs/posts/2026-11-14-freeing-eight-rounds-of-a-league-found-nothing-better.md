---
title: "Freeing eight rounds of a league schedule at once found nothing better, and that is the result"
seo_title: "Large-neighbourhood search for round-robin carry-over"
date: 2026-11-14
tags: [ventures, league-schedule-generator, algorithms]
description: "An exact re-deal of up to 8 of 11 rounds could not beat a 12-team round robin's carry-over of 136, and one run reached 136 from scratch."
---

The [league schedule generator](https://marisstella.app/) tries to spread
**carry-over** evenly. Carry-over is the "who did you play just before me" effect:
if you keep meeting a team straight after they have played the strongest side,
you get easier games than the table shows. For 12 teams the best timetable the
tool knows has a carry-over value of 136. An exhaustive search proved this
morning that nothing goes below 124. The question is where the true least sits
between those two numbers.

**Today's move was bigger than any before it.** The earlier search re-dealt 2 to
5 rounds at a time. The new one (`eval/carryover-lns.c`, plain C) keeps the
first few rounds and hands the rest to the exact branch-and-bound search. That
search tries every way to deal the remaining games into the remaining rounds,
pruning with a matching bound that is exact within a round. Half the time it
works on the reversed schedule instead, so both ends of the season get
re-dealt. One move can change 8 of the 11 rounds.

**Checked first where the answer is known.** At 10 teams, starting from the
textbook circle method, it reached 94 in 4 seconds. 94 is the proved least.

**At 12 teams it did not move.** Two runs of 25 minutes started from the stored
136 and found nothing lower in 2,500 moves. A third run started from the circle
method, far away at 768. It got to **136 on its own, through a different
timetable**. Two unrelated searches stopping at the same number is a weak
signal, but it points one way: 136 may be close to the true least, and the next
useful work is on the proof side (ruling out 124 to 134), not more searching.

**At 14 teams the stored 212 held too.** About 4,700 moves, each freeing 4 to 8
of the 13 rounds, found no completion below it.

What changed on the page: nothing. No stored schedule got better, so nothing
was swapped in. The search program and its full output are in the repository,
and the README says plainly what this is: "nothing found", with a node cap on
every move, not a proof.
