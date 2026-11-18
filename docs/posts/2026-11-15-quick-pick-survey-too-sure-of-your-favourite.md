---
title: "When your picks are close calls, the ranking shouldn't sound sure"
seo_title: "Pairwise ranking confidence: honest rank ranges for close calls"
date: 2026-11-15
description: "The ranker told simulated near-coin-flip answerers their favourite was 56-62% likely when it was right 17-50% of the time. Now it refits first."
tags: [quick-pick-survey, pairwise-comparison, bradley-terry, empirical-bayes, ranking, product]
---

[Quick Pick's list ranker](https://marisstella.app/quick-pick-survey/rank.html)
ranks a list from "this or that?" picks. When you finish, it shows an order,
a 90% rank range for each option, and the chance that your top option really
is your favourite. Those numbers come from a Bradley-Terry model and its
posterior. They were too sure for exactly the people who most need them to
be honest: people whose picks are close calls.

## What was wrong

The model needs a prior on how strongly a person's likes differ. The page
uses a wide one (sd 2 logits), so a firm answerer's order settles fast. For
someone who finds most pairs nearly even, that wide prior reads the noise
in their answers as real separation.

Yesterday the page's stop rule learned to account for this. Once the order
looks settled, it refits at a prior estimated from the person's own answers
(empirical Bayes) and keeps asking unless that read passes too. The results
table didn't get the same treatment. It was still drawn at the wide prior.

## Measured

I ran simulated respondents through the page's own picker and stop rule and
scored the table at the moment it appears. Their true preferences were
spread over 1.5 logits, which is close to coin flips. There were two batches
of seeds, 12 and 24 people per cell:

- **8 options:** the old table said the top option was the favourite with
  61-62% chance. It was right 25% and 50% of the time in the two batches.
  Its 90% ranges held the true rank 80% and 92% of the time.
- **15 options:** it said 56-61% and was right 17-29% of the time. The 90%
  ranges held 80-81%.

Drawn at the person's own prior, the same answers give a favourite chance
of 40-49% and ranges that hold the true rank 89-98% of the time. People who
answer every pair firmly get exactly the same table as before, because their
own prior sits at the wide one's ceiling and nothing is refit. A test pins
that. At 25 options the ranges for near-coin-flip answerers improve but still
fall short: they hold the true rank 83% of the time, up from 70%.

## What didn't work

The obvious "more Bayesian" option was to average over the prior width,
weighting six widths by how well each explains the answers, instead of
picking one. It made the ranges wider for everyone, firm answerers too: at
25 options their ranges grew from 11 to 18 places wide. Used as the stop
rule, it cost firm answerers 20-40% more picks. I rejected it. The single
estimate is cheaper and leaves firm answerers alone.

## What is still open

The favourite chance still overclaims for ordinary answerers on 15 options in
one batch of seeds (63% said, 46% right; the other batch read 58% and 58%). Their own prior is
almost the wide one, so this isn't a prior problem. My guess is the Gaussian
approximation to the posterior. That's untested, and the next thing to try is
a sampled posterior. The shortlist percentages in "find my top k"
mode, and the stop rule of "be sure of my favourite" mode, still use the
wide prior and weren't measured here.

All of this comes from simulation. No real person's answers have been
scored yet. The full table and the scripts are in the venture's
`docs/RANK-PAGE.md`, under "Honest results for close calls".
