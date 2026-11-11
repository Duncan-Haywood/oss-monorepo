---
title: "Can a survey tell, from your own answers, how often you click at random?"
seo_title: "Estimating a respondent's lapse rate in pairwise surveys: why it fails"
date: 2026-11-11
tags: [quick-pick-survey, ranking, glicko-2, pairwise-comparison, simulation, negative-result, fisher-information]
description: "A per-respondent estimate of how often someone answers a pick-one-of-two survey at random: their own answers barely move it, and adaptive pairs hide it."
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by asking
people to pick one of two options at a time. Earlier today we gave its
Glicko-2 rating update a "lapse" term: it can assume a share e of answers are
coin flips. With each respondent's *true* rate the update's intervals were
honest at every lapse level. With a fixed guess, everyone paid: honest people
needed up to twice as many answers before the results screen could speak.

So the obvious next step was to read e from each person's own answers.

## What we built

A grid posterior over e from 0 to 0.9. Each answer adds the log of
e/2 + (1 - e) p, where p is the chance the picked option wins. We tried three
ways to get p: the current ratings, the ratings just before the answer, and
the same without the rating uncertainty. And, to see the ceiling, an "oracle"
that uses the respondent's true win chance, which no real survey knows.

## What we found

- **The practical estimates don't move.** With a mild prior they read 0.02 to
  0.05 whether the true rate is 0 or 0.5. With a flat prior they sit near the
  middle of the grid either way.
- **The adaptive picker hides the signal.** Our staged picker asks pairs the
  current ratings think are close. On a close pair, a coin flip and an honest
  answer look the same, so it gave no signal at all. The older picker plus
  ratings without uncertainty did give a rising estimate (0.15 at a true rate of 0,
  0.40 at 0.5, with 240 answers on 30 items). That still overcharges honest people.
- **Even the oracle needs a long survey.** We computed the Fisher information
  about e in each answer. Even with the true win chances, the best possible
  error is about 0.3 after 16 answers and 0.07 to 0.11 after 240. Telling an
  honest person from a 20% lapser needs about 240 answers.
- **The best practical estimate is about as good as a fixed guess.** It
  closed half the gap in interval coverage (0.915 to 0.942, ceiling 0.972) and
  left rank accuracy where it was (0.716 to 0.718).

So nothing ships, and the survey keeps the standard update. The estimator and
the sweep stay in the repository as the measurement.

## What might work instead

Lapses show up on pairs a person should find easy. On a pair they'd pick 95%
of the time, one answer carries three to six times the information about e
of an adaptive question. Two options are a few known-easy anchor pairs, or a
lapse rate pooled across all respondents of one survey, with each person
shrunk toward it. Each is its own experiment.

Caveats: synthetic respondents with uniform random lapses, lists of 30 items
or fewer, 20 to 30 respondents per cell, no real pairwise answers. Full tables:
`docs/INFORMATION-GAIN-SELECTOR.md`, "A per-respondent lapse estimate".
