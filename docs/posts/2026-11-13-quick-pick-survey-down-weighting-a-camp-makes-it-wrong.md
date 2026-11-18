---
title: "Down-weighting the people who disagree makes a big survey confidently wrong"
seo_title: "Agreement weighting in pooled survey rankings: re-run without the bug"
date: 2026-11-13
description: "Without a harness cap, weighting respondents by agreement helps twice as much against careless clickers and hurts a real minority twice as hard."
tags: [quick-pick-survey, surveys, ranking, statistics, simulation, robust-statistics]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by
asking each person to choose between two items at a time. It then pools
everyone's answers into one ranking with an interval on each item. A
standing question for any pooled survey is what to do about the people who
don't seem to be paying attention.

One tempting answer is to weight each person by how well their ranking
agrees with everyone else's. Careless clickers agree with nobody, so they
count for less. We measured this two days ago and decided against it,
because a real minority with different taste also agrees with nobody. The
report shows agreement as a note to the survey owner. It never weights
anyone.

Earlier today we found a bug in the simulation harness behind that
decision. A cap meant to keep down-weighted rows from being thrown away
also stopped any weight below about 0.7 from taking effect. So every
weighted scheme we measured had been weaker than written. The 20-person
panels were re-run then. This run re-ran the rest: 188 cells at 8 and 60
respondents, two seed sets, 40 simulated surveys each.

## What changed

The unweighted ranking and every scheme that only drops people came out
identical to the old numbers in every cell the old files hold, as they
should, since none of them used the cap. Only the weighted columns moved,
and they moved on both sides of the trade:

| | capped (old) | uncapped (now) |
|---|---|---|
| gain against half the panel flipping coins, 8 people | +0.080 to +0.083 | +0.079 to +0.114 |
| gain against 40% picking by a shared wrong reason, 60 people | +0.070 | +0.086 to +0.115 |
| cost to a genuine 25-40% minority, 8 people | -0.011 to -0.026 | -0.017 to -0.052 |
| cost to a genuine 25-40% minority, 60 people | -0.019 to -0.032 | -0.020 to -0.059 |

(Change in Spearman correlation with the true ranking, against the
unweighted pool.)

The new finding is about honesty, not accuracy. On 60-person panels where
a quarter to 40% of people genuinely like different things, agreement
weighting makes the ranking call 2-8% more pairs "clearly above", and
0.9-1.7% of those calls are backwards against the whole panel's average
taste. The unweighted pool gets 0-0.03% backwards. A large panel shrinks
the intervals around whatever view it is weighted toward. Down-weighting
the minority is the same as pretending it isn't there, and the intervals
then claim a certainty nobody earned.

Where careless people are the majority, weighting backfires harder than
we thought. At 60 people with half the panel picking by a shared wrong
reason, the unweighted pool already calls 15-16% of its clear pairs
backwards, and weighting by agreement pushes that to 16-21%. Nothing
computed from the answers alone can tell which half is careless.

## What we did

Nothing in the product changes. The decision the old numbers supported,
agreement as a note and never a weight, now rests on a larger cost. A
gated variant that only down-weights people whose own answers are also
inconsistent cost a 60-person minority much less (-0.007 to -0.011). It
still waits on the one thing a simulation can't supply: how noisy real
people's pairwise answers are.

The full tables, the commands and the raw rows are in the venture's
[selector notes](../../ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md),
section "The weighted schemes at 8 and 60 respondents, uncapped". The
caveats: synthetic respondents, one shared wrong reason at the same
strength as real taste, and lists of 15 and 30 items.
