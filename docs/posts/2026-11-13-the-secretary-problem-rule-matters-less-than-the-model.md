---
title: "In the noisy secretary problem, knowing the score model beats a cleverer rule"
seo_title: "Noisy secretary problem: Bayes-optimal stopping vs the 1/e cutoff rule"
date: 2026-11-13
tags: [free-secretarymargin, secretary-problem, optimal-stopping, monte-carlo, research]
description: "With noisy scores, a Bayes policy finds the best of 50 candidates 38% of the time vs 24% for a tuned margin rule, unless it misjudges the noise."
---

The secretary problem asks you to hire the best of *n* candidates who arrive one at a time, deciding on each one before you see the next. The textbook answer skips the first 37% (1/*e*) of candidates and then takes the first one who beats everyone seen so far. With 50 candidates that finds the best about 37% of the time.

Two earlier free-choice projects here added noise to the scores, as you get when an interview, a test or a simulator scores candidates imperfectly. [`free-secretarynoise`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/free-secretarynoise) found the best cutoff hardly moves. [`free-secretarymargin`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/free-secretarymargin) found that requiring a new record to win *by a margin* helps a little: at noise 0.5 (noise sd half the quality sd) the chance of picking the true best rises from 0.233 to 0.244. Both ended on the same open question: how far are these rules from the best possible policy?

## The answer: far, and the rule's shape is not why

This step builds that policy. If you know how quality is distributed and how noisy the scores are, then after each candidate you can work out two numbers exactly: the probability that *this* candidate is the true best (your payoff if you stop now), and the probability that the true best is still to come. Optimal stopping then means stopping when the first number is at least the value of continuing. We estimated that value with regression Monte Carlo (the Longstaff–Schwartz method from option pricing), fitted it on 20,000 simulated rounds, and scored it on the same 60,000 test rounds the rules were scored on:

| noise | best cutoff | best margin rule | Bayes policy | clairvoyant bound |
|---|---|---|---|---|
| 0 | 0.376 | 0.376 | 0.589 | 1 |
| 0.5 | 0.233 | 0.244 | 0.382 | 0.509 |
| 1 | 0.143 | 0.149 | 0.220 | 0.274 |
| 2 | 0.074 | 0.076 | 0.103 | 0.122 |

The margin rule closes only 6 to 8% of the gap between the cutoff rule and the Bayes policy. Almost all of the gain comes from *using the scores' scale*. The cutoff and margin rules look only at who beats whom. The Bayes policy also knows that a score two standard deviations up is rare. Even with no noise this is worth a lot: that case is the classic "full-information" secretary problem, and its known optimal rule (Gilbert and Mosteller, 1966) scores 0.589 on our test rounds. Our fitted policy scores 0.5888. That match is the main check that the method works.

The clairvoyant column is an upper bound. It is a player who sees every noisy score in advance and takes the highest. No real policy can beat it, so the true optimum lies between the last two columns.

## The catch: rank rules don't need a model

The Bayes policy is only as good as the model it is given. With the true noise at 1, a policy built assuming noise 0.5 still scores 0.191, well above the rank rules. A policy built assuming noise 2 drops to 0.111, *below* the plain cutoff rule's 0.143. Believing quality is half as spread out as it really is also lands below the rank rules: 0.214 against the cutoff rule's 0.233 in that world. The likely reason, which we have not separately measured, is that a policy that expects too much noise discounts real standouts and passes them by. So use the model when your scores are calibrated (from past rounds, say). Otherwise use the rank rule, or err towards assuming *less* noise.

## Limits

This is a simulation with Gaussian quality and noise, 50 candidates and one train/test seed pair. The Bayes policy summarises the history in two numbers, so it is a lower bound on the optimum. We did not compute a dual upper bound tighter than the clairvoyant one. The natural next step is a policy that learns the noise and the quality distribution from the candidates as they arrive. That version would not need to be told the model, and could avoid the misspecification losses above.

Code, tests and the full tables: [`research/free-secretarymargin`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/free-secretarymargin). Produced with AI assistance (Claude).
