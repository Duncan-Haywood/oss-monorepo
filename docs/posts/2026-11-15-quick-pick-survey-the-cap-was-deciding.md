---
title: "The question cap was picking the winner: a checkpoint instead of an end"
seo_title: "How many pairwise questions does a decision matrix need? A simulation"
date: 2026-11-15
description: "Our free decision page ended at its question cap in 80% of simulated runs. Going on to 3x the cap named the true best 254 times in 300, not 203."
tags: [quick-pick-survey, decision-matrix, pairwise-comparison, stopping-rules, simulation, product]
---

[Weigh criteria by picking pairs](https://marisstella.app/quick-pick-survey/decide.html)
is a free decision matrix where you type no numbers. You list the options
(flats, vendors, laptops) and what you care about (rent, commute, light). The
page then asks two kinds of question: "which matters more?" and "on rent
alone, which is better?". It stops once there is under a 10% chance that any
option beats the current leader by more than a practical tie.

That stop is honest: when it fires, it is right about 97% of the time. The
trouble was that it seldom got the chance to fire. The page also had a cap on
the number of questions (41 for 5 options and 3 criteria), and on 300
simulated people 240 runs hit the cap first. A run that ends at the cap names
whoever happens to lead at that moment, so in most runs the cap, not the
evidence, was picking the winner.

## What we measured

We walked the page as it ships (graded "much / a bit better" answers, the
guarded stop, the picker that aims at the leader's rivals) out to four times
the cap. The simulated people, seeds and answer model are the ones behind
every earlier table. The picker never looks at the cap, so one walk shows
what every smaller cap would have done. At the old cap the numbers matched
the published table exactly, which checks that the sweep measures the same
page.

For a person who says "much better" on about a third of their picks:

| cap | runs ending at the cap | true best named (of 300) | true best more than a practical tie ahead of the one named | picks in all |
|---|---|---|---|---|
| 1x (before) | 240 | 203 | 42 | 28,762 |
| 2x | 145 | 232 | 28 | 45,506 |
| **3x** | **82** | **254** | **12** | **55,013** |
| 4x | 45 | 257 | 11 | 59,531 |

Going to 3x cuts the bad misses from 42 to 12, for 91% more picks. Going on
to 4x buys almost nothing more.

## Why it is not simply a bigger cap

Those picks are someone's time. At three times the cap, a person who keeps
going answers about 80 to 100 questions for 5 options and 3 criteria, and
over 300 for 12 options and 5 criteria. Some people will want that for a
lease they will live with for years, and many will not want it for a laptop.

So the old cap stays, as a checkpoint. When you reach it the page shows the
results so far. If the top is still close it says so and offers "Keep going
until it is settled (at most N more)". That button keeps asking until the
stop passes or three times the cap. "Show results now" still works at any
point.

## Rank them all

The picker aims at the winner, so the order below it stays loose. A new
"Rank them all" switch asks about the whole order instead. In the same
simulation the full order came out closer to the truth (rank correlation
0.854 against 0.797 at 3x), but the winner was named less often (194 against
254) and it took more questions. That is the right trade when you need a
shortlist to work through in order, such as which agents to phone first. A
shared link carries the switch.

## What is still open

For people who say "much better" on most picks, the longer runs strain the
stop's promise: it holds 89% of the time, not 90%, for someone who says
"much" on about 63% of picks. Closing that gap is the next item. It is
listed with every number above in [the page's
notes](../../ventures/quick-pick-survey/docs/DECIDE-PAGE.md) ("A larger
cap"), with the 1,800 simulated runs beside them. None of these people
are real. Whether anyone actually presses "keep going" is something only
real use can tell, and the page now counts that press on your own device only.

The page is for weighing your own choices. It is not the only basis for a
hiring, financial, medical or relationship decision.
