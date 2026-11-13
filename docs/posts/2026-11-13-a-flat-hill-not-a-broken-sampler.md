---
title: "A flat hill, not a broken sampler: why a survey's prior fell to the floor"
seo_title: "Why a pooled empirical-Bayes prior collapsed under adaptive pairing"
date: 2026-11-13
tags: [quick-pick-survey, statistics, bayesian, simulation]
description: "A pooled prior sd fell from 1.155 to 0.33. The sampler was fine: close pairs leave the evidence flat. An interval upper end fixes honest panels only."
---

Quick Pick Survey ranks a list by asking people to choose between two items at a time. Its insights screen refits each person's answers with a Bradley-Terry model, and the prior on the item scores matters: too wide and the leader is shrunk too little, too narrow and every interval claims more certainty than the answers give. Since 12 November each survey stores one prior sd pooled over its last 40 respondents, chosen by maximising their summed marginal likelihood (the evidence).

Yesterday's run left a loose end. In one simulated cell, 15 items with 8 answers per item under the "staged" pair selector, the pooled sd came out at 0.33 when the true spread was 1.155. Intervals drawn at that prior held only 39% of true pairwise gaps, against a target of 95%.

## Not the sampler

The evidence is estimated by importance sampling from a Laplace approximation, 2000 draws a person. That was the first suspect. Rerunning the same 40 people with 20,000 draws on a different seed moved the summed log evidence by at most 0.4 nats, with the same shape. The estimator was fine.

## A flat hill

The shape was the story. Summed over 40 people, going from a prior sd of 0.3 to 1.2:

- under the **shipped** selector the log evidence climbs **281 nats**;
- under **staged** it moves **5 to 13**.

Staged asks close pairs on purpose, because they sort the top of the list fastest (mean true gap 0.80 logits against 1.25). But an answer to a close pair is nearly a coin flip whatever the spread of likes, so it says almost nothing about the spread. On a hill that flat, ordinary panel noise can put the top anywhere.

Across 13 fresh staged panels the pooled sd landed between 0.86 and 1.06 twelve times and at 0.33 once. Nothing in the collapsed panel's answers looked unusual: upsets were 33.15% of answers against 33.08% predicted by the true gaps. Even the twelve good panels lean low, and that lean goes away when the true likes are normal rather than uniform (1.09 to 1.31). So the lean comes from a Gaussian prior misfitting uniform likes, which neighbour comparisons expose.

## A guard that works for honest people

If the hill is flat, the maximum is the wrong summary. A safer one for intervals is the largest prior sd the answers still allow: the upper end of the likelihood interval, where the summed evidence has dropped 1.92 nats from its best. A prior that is too wide only makes intervals wide; one that is too narrow makes them wrong.

Over 18 cells (8 to 30 items, 2 to 8 answers each, two seed bases) with honest respondents:

| selector | fixed prior (2.0) | pooled maximum | upper end |
|---|---|---|---|
| shipped | 96.9%, half-width 2.43 | 94.2%, 1.90 | 95.7%, 2.06 |
| staged | 94.8%, 2.34 | 86.6% (worst 38.9%), 1.63 | 95.5% (worst 89.9%), 2.02 |

That is 95% coverage at about 15% less width than today's fixed prior. With staged and many answers it even beats the fixed prior on coverage: at 30 items and 8 answers each, 0.94 against 0.87–0.88.

## And why it is not shipped

When one answer in five is a coin flip, the upper end's worst cells fall to 72% and 76% coverage, where the fixed prior keeps 86% and 81%. Careless answers look like a small spread, so the evidence asks for a narrow prior, which is a reasonable inference that the intervals cannot afford. The screen keeps the fixed prior for its pairwise intervals. The function is in the code, tested and not wired in. The next step is to use it only for respondents the app's lapse estimate calls honest.

Everything here is simulation: synthetic Bradley-Terry respondents, 40 per cell, uniform truth for the coverage sweep. The write-up with every row is in `ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md`, "Why the pooled sd collapsed", and the scripts that produced it are in the venture's `scripts/` folder.
