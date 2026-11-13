---
title: "Telling a bored respondent from one who just speeds up: fit the line and the step together"
seo_title: "Detecting careless survey blocks without flagging people who speed up"
date: 2026-11-13
description: "A split search on answer times takes a steady speed-up with a small bump in it for a careless block. Fitting the person's own trend and the step together cut honest flags from about 5% to 2% in simulation."
tags: [quick-pick-survey, surveys, data-quality, response-time, change-point, statistics, simulation]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by
asking people to pick between two options at a time, and it times every
pick. One of its data-quality views, "rank without answers after someone sped
up", looks for respondents who answer properly for a while and then start
clicking through. It finds the point where each person turned much quicker
than everyone else at the same point in the survey, and leaves out their
answers from there on.

That works when people keep a steady pace. Real people don't. Some get faster
as they learn the screen, and some slow down as they tire. In simulation, with
each person's own pace drifting by about 0.6 on the log scale over a session,
the view still flagged about 5% of honest respondents after two earlier fixes.

## Where those flags came from

The detector looks for the single split with the biggest gap between earlier
and later answer times. A steady speed-up has a big gap at its middle, so a
second test was already in place: a step has to fit better than a straight
line. That catches a pure speed-up. But honest noise often adds a small bump,
and a line plus a bump fits a step a little better than a line. In bare
sequences of 60 answers, 4.3% of pure lines with noise were flagged. Those
flagged had a median step of 0.40 on top of their line: the noise had made the
step, and the line made it look big.

## The fix

Fit the person's own straight line and the step at the same time, by ordinary
least squares on three columns: a constant, the answer's position, and a 0/1
step from the split on. The step's coefficient is what is left once the
person's own trend is accounted for. A bored respondent who also drifts keeps
their whole step. Someone who only drifts keeps a bump. The view now asks that
net step to be at least as large as the gap it already required (between 0.4
and 0.5 log, set per survey).

## What it did in the sweep

204 simulated cells, panels of 20, 40 surveys each. "Ceiling" is how much of
the ranking error you would remove by dropping exactly the careless answers.

| person's own drift | honest flagged, before | after | share of ceiling, before | after |
|---|---|---|---|---|
| none | 0.0% | 0.0% | 99% | 97% |
| 0.3 log | 3.4% | 1.6% | 86% | 85% |
| 0.6 log | 5.4% | 2.0% | 65% | 66% |

Under drift it more than halves the honest flags, for no loss of the ceiling.
Where nobody drifts it costs two points, because a block that starts late
leaves a short tail and the line soaks up some of its step. A stricter
setting (1.25 times the gap) removed almost every honest flag but gave up 18
points of the ceiling with no drift.

## What it doesn't fix

If someone's pace *wanders* rather than drifts in a straight line (a random
walk), the wander can hold a real step of its own. With a wander of about 0.3
log over a session, the fix halves honest flags from 10.4% to 5.5%. At twice
that, about 20% of honest people are still flagged whatever the setting, and
the view does more harm than good. So the open question is no longer about
the method. It is about real people: how much their pace wanders. The first
real survey's answer times decide whether this view should be offered at all.

The method, the full table and the raw rows are in the venture's
`docs/INFORMATION-GAIN-SELECTOR.md`, section "A step net of the person's own
trend". The view is still a comparison, not the default ranking.
