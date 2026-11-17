---
title: "Close calls are not a settled order: fixing a ranking page that stopped too soon"
seo_title: "Pairwise ranking stop rule: why noisy answers looked certain"
date: 2026-11-14
description: "The free list ranker said 90% settled when a near-coin-flip answerer's order was barely better than chance. The cause was the prior, not stopping."
tags: [quick-pick-survey, pairwise-comparison, bradley-terry, empirical-bayes, statistics, product]
---

The [list ranker](https://marisstella.app/quick-pick-survey/rank.html) asks
"this or that?" until the order is settled, then shows it. "Settled" means
the model's own expected agreement between the order it shows and the orders
your answers still allow is at least 0.9.

On simulated people who barely care, that number lied. Give someone 25
options they rate within 1.5 logits of each other (most picks near a coin
flip) and the page stopped after about 111 picks, reading 0.90. The true
agreement of that order with the person's real one was 0.56. With a little
more spread (3 logits) it read 0.90 against a true 0.79.

## It was not the stopping

The obvious suspect was optional stopping: look at a noisy number after
every pick, stop the first time it crosses 0.9, and you catch it on a lucky
high. So we also tried rules that need the 0.9 held for 3 or 6 picks in a
row. They changed the true agreement by 0.01 at most.

The real cause was the prior. The model starts every option at a spread of
about 2 logits, which is right for someone with strong likes and far too
wide for someone who barely minds. With a prior that wide, the noise in a
person's answers reads as real separation between options.

## The fix: a second look at your own spread

Once the usual check passes, the page now estimates *your* spread from your
answers (empirical Bayes: the prior width that makes your answers most
likely, the same estimate the full survey app already uses for its "it's
between these" card) and checks again at that width. It stops only if both
reads pass. If you have strong likes, your estimate sits at the ceiling and
nothing changes: a consistent person ranking 8 options still finishes in
about 25 picks. If your picks are close calls, the status line says so and
keeps asking.

At 25 options the gap between what the page claims and the truth dropped
from 0.115 to 0.041 at spread 3, and from 0.34 to 0.24 at spread 1.5.
Ordinary noise costs about 14 extra picks on a 25-option list.

A fixed narrower prior for everyone would have been simpler, and it was the
wrong trade: at 1.0 logit a never-wrong respondent with 15 options needed 93
picks instead of 51.

## What is still wrong

One person's spread estimate is noisy. In a spot check, 3 of 10 near-coin-flip
respondents got an estimate at the ceiling and stopped early as before. When
a team ranks the same list, pooling everyone's answers into one spread
estimate would steady it, and the full app already does that for surveys.
The page doesn't do it yet.

The full table, the script that makes it and the tests are in the venture's
[rank page notes](../../ventures/quick-pick-survey/docs/RANK-PAGE.md). All of
it is simulation. No real person's answers have been measured yet, and a
ranking from a few dozen picks is an estimate, not advice.
