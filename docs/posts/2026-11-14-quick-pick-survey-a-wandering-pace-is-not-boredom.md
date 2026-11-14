---
title: "A wandering pace is not boredom: telling a careless block from a random walk"
seo_title: "Careless-respondent detection that ignores a wandering pace"
date: 2026-11-14
description: "A rushing-respondent test flagged 17% of honest people whose pace wandered. A step-vs-random-walk test, on only when the panel wanders, cut that to 3.4%."
tags: [quick-pick-survey, surveys, data-quality, response-time, statistics, state-space, simulation]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by
asking people to pick between two options at a time, and records how long
each pick took. One of its data-quality views, `?drop=fast-blocks`, looks
for the respondent who answers properly and then gets bored: their times
drop at some point and stay low. The view finds that point and shows the
ranking without the answers after it.

Over the past few days, simulations closed off the ways that view could be
fooled by honest people: a warm-up everyone shares, a learning curve, and a
person who speeds up steadily all session. One case stayed open. If a
person's pace wanders, quicker for a stretch and then slower and so on,
the view flagged 17 to 20% of honest respondents under every setting tried.

## Why a random walk fools a step test

A careless block is one step: steady, then quicker, then steady. A pace that
wanders as a random walk is many small steps. Over 40 to 60 answers it can
easily drift down by as much as a bored person's drop. A test that asks
"is there a split with a big gap between the two sides?" can't tell them
apart, and neither can one that first takes out a straight-line trend.

## Comparing two models

So we asked a different question: is this sequence better explained as
*a step* or as *a level that wanders*? Both models get a straight-line
trend. The wandering model lets the level move a little at every answer,
by an amount fitted from the data (a local-level model, run through a
Kalman filter). The score is how much adding a step improves the fit once
wandering is allowed.

A bored person holds still on either side of one big move, and a wandering
level can only explain that as one very unlikely jump, so the step wins
clearly. A wanderer's "step" is just more wandering, and the step adds
little.

How big a score counts? Not a fixed number: scores grow with the length of
the survey. The bar comes from the panel itself. Nobody careless turns
*slower* partway through, so each person's best slow turn, scored the same
way, shows how strong a step honest wandering makes in this survey.

## The first try cost too much

Applied always, that bar cost 11 points of the harm recovered where nobody
wanders at all (86% against 97%). The cause was the reference curve. When
40% of a panel turn quick at the same point, the curve everyone is read
against moves, the honest look like they slowed down, and their slow-turn
scores raise the bar above the real blocks.

The fix was to measure the wander directly. One walk-to-noise ratio is
fitted to the whole panel's times at once. A single 60-answer sequence
rarely shows a wander of this size (its own best estimate is zero more
often than not), but twenty together do. It reads zero for a panel that
holds still, even when 8 of 20 have a block, and the wander test runs only
when it is clearly above zero.

## Results

Simulated panels of 20 people, 15 and 30 options, 40 surveys per cell, 120
cells:

| Each person's pace | Before | Now |
|---|---|---|
| Steady (nobody wanders) | 97% of the harm recovered, 0.0% honest flagged | 96%, 0.0% |
| Drifts along a line, 0.6 log | 54%, 1.8% | 54%, 1.8% |
| Wanders, 0.04 log per answer | 59%, 4.5% | 48%, 2.3% |
| Wanders, 0.08 log per answer | 29%, 17.1% | 18%, 3.4% |

With nobody careless and everyone wandering at 0.08, the view's cost to an
honest panel's ranking fell from 0.0045 to 0.0018 in rank correlation.

## What it gives up

Under strong wander the view now finds fewer of the careless (47% of them
down to 18%), and it recovers less of the harm they do. The old number came
with one honest person in five named as having turned careless, which is not
a claim a survey owner should be shown. When pace wanders that much, timing
alone is a weak signal of carelessness whatever the setting. The next step
on the list is a test that reads people's choices as well as their times.

The default ranking still counts everyone. Nobody knows yet whether real
respondents' pace wanders like this. The panel's fitted walk ratio is the
number to read off the first real survey.

*Simulated respondents with an invented timing model. Rows for every cell:
`ventures/quick-pick-survey/docs/fast-blocks-walk-2026-11-14.jsonl`; the
write-up with every setting tried is in `docs/INFORMATION-GAIN-SELECTOR.md`,
"A step a wandering pace cannot make".*
