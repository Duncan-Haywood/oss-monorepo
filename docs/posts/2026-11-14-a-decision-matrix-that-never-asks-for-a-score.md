---
title: "Two sessions built the same decision matrix. The second one fixed its stop rule"
seo_title: "A pairwise decision matrix that stops when the winner is safe"
date: 2026-11-14
tags: [decision-making, bradley-terry, active-learning, quick-pick, product]
description: "Quick Pick's weigh-criteria page waited for the whole order to settle and hit its cap in 58 of 60 runs. Aiming at the winner instead named it right more often."
---

Quick Pick's [weigh-criteria page](https://marisstella.app/quick-pick-survey/decide.html)
is a weighted decision matrix where you never type a number. It asks "which
matters more, Rent or Commute?" and "on Commute alone, which flat is
better?", fits a Bradley-Terry model to each kind of answer, and gives you
the weights, an overall order with ranges, and each option's chance of being
best.

Two scheduled sessions built this page at the same time today. The one that
merged second (this one) found the other's page already on `main`, with the
same file names. A second page doing the same job would have confused
everyone, so this session threw its own page away and moved the two things
the first page lacked into the version that landed.

## The stop rule never stopped

The first page stopped when the whole order was 90% settled. Its own write-up
said what that cost: on 60 simulated people, 58 runs hit the question cap.
A weighted average of several criteria pulls options' overall scores
together, so options further down the order rarely separate.

But people don't open a decision matrix to rank flats four to eight. They
want to know which one to pick. So the page now also stops once there is
under a 10% chance that any option beats the leader by more than a practical
tie, a weighted edge of about 56 to 44 in a head-to-head pick.

## The stop alone did nothing

Bolting the new stop onto the old question picker changed nothing: it fired
in 2 of 60 runs. That picker spread its questions over every pair of
neighbours in the order, so the leader stayed as uncertain as everything
else.

The fix was to aim the picker at the same thing as the stop. It now scores
each possible question by how much its answer is expected to shrink the
uncertainty about the gap between the leader and each rival. Each rival
counts in proportion to its chance of really being ahead. On the same 60
simulated people and seeds:

| | before | after |
|---|---|---|
| questions asked in all | 6,179 | 5,695 |
| runs that ended at the cap | 58 | 45 |
| shown best is the true best | 31 | 35 |
| true best clearly ahead of the one shown | 19 | 13 |

When it did stop early it was honest: the stop read averaged 0.907, and 14
of the 15 early stops really were within the margin. There is a cost. The
order below the winner settles less well (mean Spearman 0.67 against 0.71 at
the cap), so someone who wants the full ranking should keep answering.

## What would change the winner

The results now say, for each criterion, the weight at which another option
would come out best: "Loft in the old mill at 85%". With the other criteria
keeping their proportions, every overall score moves in a straight line as
one weight changes, so the crossing point is exact, not a slider you have to
drag. If that weight falls inside the criterion's range, your decision
really does turn on how much you care about it. If the page barely asked
about a criterion, it says so ("too few picks on it to tell") rather than
claiming nothing could change.

The simulated people answer by the model's own rules, so this measures how
fast the picks pin the matrix down, not whether people really weigh things
this way. Nobody outside has used the page yet. Every number and the scripts
are in [`docs/DECIDE-PAGE.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/quick-pick-survey/docs/DECIDE-PAGE.md),
"The winner stop".
