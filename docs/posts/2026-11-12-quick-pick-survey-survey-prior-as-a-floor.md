---
title: "Pooling a survey's answers helped the average respondent and hurt the hardest ones"
seo_title: "Empirical Bayes in a mixed survey: the pooled prior as a floor"
date: 2026-11-12
description: "A prior pooled over a survey missed the favourite for people whose likes sit close together. The narrower of theirs and the pooled one reached 95%."
tags: [quick-pick-survey, surveys, ranking, statistics, empirical-bayes, simulation]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by asking
you to choose between two items at a time. When its results screen can't
name a clear favourite, it says "still too close to call: it's between X, Y,
Z". That list is a 95% credible set: the fewest items that together carry a
95% chance of being your favourite.

Earlier today the set started using a prior estimated from each person's own
answers (empirical Bayes). The prior says how far apart a person's likes
probably are. With the old fixed prior, the set held the true favourite for
88-92% of simulated respondents. With each person's own estimate it held it
for 93-96%, but the lists got longer, because one person's few dozen answers
are a noisy guide to their spread.

The obvious next step was to pool. Estimate one prior from everyone who has
answered the survey, store it, and use it for each new person. In that
earlier test the pooled prior covered as well as each person's own and
named about one item fewer.

## The catch: that test pooled identical people

Every simulated respondent in the panel had the same spread of likes and
the same rate of careless taps, so the pooled value was right for all of
them. Real surveys mix people: some feel strongly about the options, some
barely care, some tap without reading.

So we built a mixed survey: equal shares of people with narrow, middle and
wide spreads, half of them answering carelessly one time in five. We pooled
over 120 of them and scored 120 more in each of 9 list designs, on both
question selectors and two seed bases. Each score counts only the people
who were actually shown the list.

| prior the set uses | holds the favourite | names in the list |
|---|---|---|
| fixed (the old one) | 81-87% | 5.1-6.4 |
| the person's own | 92.2-94.3% | 8.5-9.1 |
| pooled over the survey | 91.4-94.0% | 7.2-7.9 |
| the narrower of own and pooled | **95.4-96.4%** | 9.0-10.1 |

Averaged over everyone, pooling looks fine. Split by group, it does not.
The pooled prior lands in the middle of the mix, near 1 on the model's
scale. That is too wide for people whose likes sit close together, and
their coverage fell to 83-92% (77-89% if they also answered carelessly).
People with a wide spread got more coverage than they needed (96-100%). The
shorter lists came out of the hardest group's misses.

## Why "the narrower of the two" works

A prior that is too wide shrinks the leading item too little. The set then
puts too much faith in whichever item happened to come out on top: the
winner's curse. A prior that is too narrow only makes the list longer. The
person's own estimate can be wrong in either direction, so taking the
narrower of their estimate and the survey's removes most of the harmful
errors. The cost is length. That rule held 95.4-96.4% overall, kept the
narrow-spread careless group at 89-94% (their own estimate alone gave
85-94%), and raised the worst list design from 86-89% to 89-93%. It names
0.4-1.1 more items on average. The card shows three names and says how many
more are in the running, so the extra length mostly goes into that count.

## What shipped

Each survey now stores a pooled prior, estimated from its 40 most recent
respondents. The results screen uses `min(your prior, the survey's)` once
the stored value pools at least 10 people. Before that, your own prior is
used, as before. The estimate is refreshed after the page has responded,
once the survey's answer count has grown by a quarter. The search pauses
between respondents so it never blocks other requests, though it takes up
to about 11 seconds of CPU at 40 items. A database test covers the effect
on the page: a narrow survey prior adds a fourth name to a round robin's
three, and a wide one changes nothing.

The method and every number are in
[the measurement doc](../../ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md)
("A stored survey prior"), with raw rows in `docs/mixed-prior-2026-11-12.jsonl`
and the sweep in `scripts/mixed-prior-sweep.ts`.

**Limits.** These are simulated respondents who follow the Bradley-Terry
model, with the mix of groups chosen by us, not measured, and lists of 30
items or fewer. A group's coverage moves by a few points between seed bases,
and the table gives both. The tool has no real pairwise answers yet, and
those are what would settle whether real people's spreads vary this much.
