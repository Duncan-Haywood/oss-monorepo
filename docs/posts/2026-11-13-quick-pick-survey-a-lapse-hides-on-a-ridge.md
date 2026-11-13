---
title: "Modelling careless respondents doesn't rescue a pooled prior: spread and lapse sit on a ridge"
seo_title: "Lapse models, pooled priors and an identifiability ridge"
date: 2026-11-13
description: "We let each respondent have their own share of random answers. The pooled prior then could not tell a wider spread from more randomness, so it gained nothing."
tags: [quick-pick-survey, surveys, ranking, statistics, empirical-bayes, identifiability, simulation]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by
asking you to choose between two items at a time, and its results screen
shows an interval for how far apart any two of your items are. Those
intervals use a fixed prior. A prior pooled across everyone in the survey
would make them 9-15% narrower when every respondent is honest. Careless
respondents, people who answer some questions at random, break it. A random
answer looks like a person who barely prefers anything, so careless people
pull the pooled spread down and everyone's intervals become falsely sure.

The [last run](2026-11-13-quick-pick-survey-gating-on-consistency-picks-the-spread.md)
tried filtering careless people out and found that any filter built on
consistency also picks out the people whose items are far apart. It ended
on the obvious alternative: don't filter anyone. Give every respondent
their own lapse share *e* in the model, so each answer has chance
*e*/2 + (1 − *e*) σ(difference), and let a coin flip be explained by the
lapse rather than by a smaller spread.

## What we built

`lapsePool.ts` scores each person's answers at every (spread, lapse) pair
on a grid of seven lapse shares from 0 to 1. It importance-samples the
marginal likelihood from a Gaussian proposal at that posterior's mode. The
lapse likelihood isn't log-concave, so the proposal's precision comes from
the Fisher information rather than the Hessian. We combined the
per-person grids two ways: by fitting the panel's lapse distribution by EM
at each spread, and by putting a fixed Beta(1, 19) prior on each person's
lapse. Then we ran both through the same 72 simulated panels the gates were
scored on.

## The result: a ridge

The free-weight version always lands its upper end within a few hundredths
of the ceiling (1.85-1.96 against 2.02), so its intervals match the fixed
prior's. That's safe, but it gains nothing, even on panels where nobody is
careless. A table of panel evidence against spread shows why. For 20 honest
respondents under the shipped selector, the evidence drops 17.6 nats from
the best spread to a spread of 2 when the lapse is pinned at zero. Let the
lapse float and it drops 3.0. At a spread of 2 the model puts 82% of its
weight on a 10% lapse. A wider spread plus a little randomness fits honest
answers about as well as the true spread with none.

A lapse shows up only as a cap on a pair's chance: at most 1 − *e*/2, even
for items far apart. Only pairs far apart on the person's own scale can show
that cap. With 2 to 8 answers per item there are too few such pairs, under
either selector.

The fixed Beta(1, 19) prior fails the other way. It makes a 0.4 lapse
costlier than a narrower spread, so the fit reads careless people as
low-spread again and tracks the lapse-blind pool to within 0.012. With half
the panel careless at 0.4, honest respondents' intervals hold the truth
90.3% of the time, against 96.8% for the fixed prior. Any prior between the
two makes the same trade. A prior loose enough to absorb careless people is
loose enough to absorb an honest panel's spread.

## What it means

The intervals keep the fixed prior. Together with the last run, this closes
both ways of handling careless respondents from their choices alone:
filtering them out and modelling them. To narrow the pooled prior safely we
would need information about who is careless that doesn't come from the
choices, and answer times on a real survey are the candidate. Until real
answers exist, a 9-15% gain on honest panels isn't worth intervals that
hold 0.6-0.9 of the time on careless ones.

Everything is synthetic: Bradley-Terry respondents with evenly spread likes,
a constant lapse from the first answer, 40 people per panel and one seed
base. The rows, the sweep and the ridge script are in the repository
(`docs/lapse-pool-2026-11-13.jsonl`, `scripts/gated-upper-sweep.ts
--lapse-pool`, `scripts/lapse-ridge.ts`). The full write-up is the section
"A pooled spread that models the lapse" in
`docs/INFORMATION-GAIN-SELECTOR.md`.
