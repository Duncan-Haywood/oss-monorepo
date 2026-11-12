---
title: "Letting each person's answers set the prior, and the textbook shortcut that broke it"
seo_title: "Empirical Bayes for pairwise data: Laplace vs sampled evidence"
date: 2026-11-12
description: "A prior set from each person's answers lifted the favourite list from 88-92% to 93-96% coverage, once the Laplace evidence was replaced."
tags: [quick-pick-survey, surveys, ranking, statistics, bayesian, simulation]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by showing
you two options at a time. When your answers don't settle your favourite, the
results card says "still too close to call: it's between A, B, C". Earlier
today [that list became a 95% credible set](2026-11-12-quick-pick-survey-who-its-between.md):
the fewest items that together carry a 95% chance of being your favourite.
On simulated respondents it held the true favourite **88-92%** of the time.
That is better than the old list but still short of 95%.

The reason was the prior. The model that refits your answers assumes your
likes and dislikes are spread with a standard deviation of 2.0 on the logit
scale, Glicko's familiar 350 rating points. The simulated people are spread
less than that (1.155). A prior that is too wide shrinks the leader too
little, so the model is too sure the leader is the favourite. This is the
winner's curse: the favourite is a maximum over many items, and maxima are
where overconfidence shows.

Setting the prior to the simulator's own spread would only calibrate the
card to an assumption. The principled fix is **empirical Bayes**: choose the
prior spread that makes *your* answers most probable (the type-II maximum
likelihood, or "evidence"), then refit with it.

## The textbook shortcut collapsed

The usual way to compute the evidence for a model like this is the Laplace
approximation: treat the posterior as a Gaussian around its peak. We did that
first. Under the app's adaptive "staged" question picker, the estimate fell to
its floor (0.3) for about a third of respondents. Pooling 60 respondents
didn't help: several cells still sat at the floor.

So we checked the approximation against an importance-sampled evidence,
which converges to the exact value. Summed over simulated respondents (true
spread 1.155):

| cell | question picker | Laplace peak | sampled peak |
|---|---|---|---|
| 15 items x 4 answers | random-ish (shipped) | 1.0 | 1.0 |
| | adaptive (staged) | **0.45** | 1.2 |
| 30 items x 4 answers | shipped | 1.0 | 1.0 |
| | staged | **0.45** | 1.2 |

The staged picker asks the pairs your current ratings call even. Those are
the pairs where the posterior is least Gaussian, and there the Laplace
curvature favours a small prior. The likelihood principle says an adaptive
design doesn't change what your answers mean, and it still holds: the exact
evidence peaks in the right place. The approximation is what breaks.

One detail decided whether the sampler was usable. We drew from the Laplace
posterior with its covariance widened a little, a standard safety margin. At
30 items a margin of 1.5x gave the log evidence a standard deviation of 0.3
from seed to seed. A margin of 1.1x gave 0.02, because the weights' variance
compounds once per item.

## What it did to the list

With the sampled evidence, each person's own prior spread, and 60 simulated
respondents in each of 9 list-length and answer-count cells:

| respondent | fixed prior | own estimated prior |
|---|---|---|
| honest, staged | 88% / 5.2 names | 93-96% / 8.4-8.7 names |
| honest, shipped | 90-92% / 6.0 names | 95% / 7.4-7.6 names |
| 20% careless answers, staged | 76% / 5.2 names | 90% / 10.0 names |
| 20% careless answers, shipped | 83% / 6.5 names | 95% / 9.3 names |

Careless answers look like mild preferences, so the estimated spread shrinks
and the list widens. For a claim like "it's between these", that is the safe
direction. The cost is length. The card still names three items and counts
the rest ("most likely A, B, C, or one of 5 more"), so the screen stays
short. What changes is that the count is honest.

## What it did not fix

The same refit gives a 95% interval for every pair of items. We measured
those too, and **left them alone**:

- One person's own estimate is too noisy for intervals: they cover 77-84%.
- Pooled across a survey at the right spread, they are 22-24% narrower but
  cover 93%, a little under nominal.
- With 20% careless answers either estimate drops to 64-75%, while the wide
  fixed prior keeps 90-92%.

A wide prior is a cheap form of robustness, and the intervals need it more
than the favourite list does. So the results screen now uses two refits of
the same answers. The ratings, the intervals and the "clear favourite" rule
use the fixed prior. The "it's between" list uses the person's own. Each
choice is measured, and the doc says why.

## Shipped, and what's next

The insights route estimates the prior with 2,000 seeded draws and a short
golden-section search: about 60 ms for 15 items with 4 answers each. Past 40
answered items it falls back to the fixed prior. An integration test fails on
the old route: in a six-item round robin where the earlier item wins two
answers in three, the fixed prior lists four items and the person's own prior
keeps a fifth.

A survey-level prior, pooled across respondents and stored, reaches the same
coverage with shorter lists (6.9-7.8 names). That is the next step, along with
real answers to check all of this against. Everything is synthetic so far:
Bradley-Terry respondents with uniform true preferences, 30 items or fewer.

Full tables, seeds and the Laplace-era numbers:
[`docs/INFORMATION-GAIN-SELECTOR.md`](../../ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md),
"An empirical-Bayes prior", and `docs/eb-prior-2026-11-12.jsonl`.
