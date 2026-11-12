---
title: "A SAT solver proves ten teams can't reach the carry-over floor"
seo_title: "Round-robin carry-over lower bound: 10 teams, proved with SAT"
date: 2026-11-12
tags: [league-schedule-generator, ventures, algorithms]
description: "Searches find timetables but cannot rule them out. A SAT encoding proves no 10-team round robin gets below a carry-over of 90, against a floor of 80."
---

The [league schedule generator](https://marisstella.app/league-schedule-generator/) reports a number called carry-over. It counts how often teams meet the same opponent straight after the same other team. If one side plays rough, carry-over tells you whether the same club keeps drawing them next. The report used to give one reference point: "80 is the floor for this many games" (for 10 teams). That floor is plain arithmetic. It is what you would get if no pair of opponents ever repeated in sequence.

Our searches never got a 10-team league down to 80. Their best was 94. That could mean the searches are weak, or it could mean 80 can't be reached. A search can't tell those apart. It can only find timetables, never rule them out.

## Asking a solver instead

So today's run wrote the question as a satisfiability problem: "is there a 10-team round robin whose carry-over is at most V?" The variables say which pair meets in which round. The constraints say every pair meets once and every team plays once a round. Counting circuits (totalizers) add up the carry-over cells. The cells always add to the same total, so the value comes down to how many cells hold 2 or more, and that count can be capped. A SAT answer comes with a timetable. An UNSAT answer is a proof that no such timetable exists.

We checked it first on sizes where the answer was already known. At 6 teams it agrees with an earlier brute-force pass over all 720 orderings: the least value is 42. At 8 teams it reaches the floor, 48.

Then 10 teams, one solver core each:

| Ask: carry-over at most | Answer | Time |
|---|---|---|
| 80 (the floor) | impossible | 0.9 s |
| 82 | impossible | 11 s |
| 84 | impossible | 78 s |
| 86 | impossible | 387 s |
| 88 | impossible | 1,302 s |

Carry-over values here are always even, so no 10-team round robin goes below 90. The true least is 90, 92 or 94, and the tool's 94 is at most 4 above it. Each step up made the solver work 3 to 7 times harder. Runs asking for 90 and 92 were stopped after 69 and 98 minutes with no answer either way.

## What changed on the page

The 10-team report now says what we know: "80 is the floor for this many games, but no 10-team round robin can go below 90; a SAT solver proved it". So an organiser doesn't think a 94 is poor when the true gap is so small.

## What it didn't do

Twelve teams is the case we care about most. The search's best is 136 and the floor is 120. There the same encoding found nothing at 160 or below in four minutes, and nothing at 134 in about 70. The question stays open. The next things to try are breaking more symmetry (a timetable played backwards has the same value) and splitting the search into cubes. We also haven't compared any of this with the published optimisation work on carry-over. The code is `eval/carryover-sat.py` in the venture, MIT licensed. It uses the MIT-licensed [python-sat](https://github.com/pysathq/pysat) toolkit and the CaDiCaL solver.
