---
title: "The clear favourite that was a coin flip"
date: 2026-11-12
tags: [quick-pick-survey, statistics, ranking, bradley-terry, glicko]
description: "Quick Pick called a clear favourite for three respondents in four, wrong in over half. A refit of each person's answers fixes the intervals and the claim."
---

[Quick Pick](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/quick-pick-survey) ranks options by asking people "this or that?" a few dozen times. Each person's answers update a Glicko-2 rating for every option, one answer at a time, and the results screen reads those ratings back. One card names your top pick. If the leader isn't clearly ahead, it says "still too close to call: it's between X, Y, Z".

A sweep earlier this week found a calibration gap. Under the staged question selector the survey uses, only about 90% of a person's 95% intervals on the difference between two options held the true difference. Today's run went after the cause, and on the way it found that the top-pick card was barely better than guessing.

**Why the intervals were too narrow.** Glicko-2 books each answer against the other option's current rating, as if that rating were close to right. The adaptive selector asks exactly the pairs the current ratings call even, so every answer is counted as carrying the most information an answer can carry. Often the pair isn't actually even. The fix is to stop updating one answer at a time. Refit all of a person's answers at once as a Bradley-Terry model, with a prior that matches Glicko's starting uncertainty, and read the uncertainty off the curvature of that fit (a Laplace approximation). How the questions were chosen then doesn't matter, because an adaptive design changes which answers arrive, not what they mean.

On synthetic respondents (8 to 30 options, 2 to 8 answers per option, 540 people per selector, two seed sets), honest people answering the staged selector got:

- **95% coverage:** 0.947 for the refit, against 0.904 to 0.910 for Glicko, with intervals of the same average width.
- **Rank accuracy:** 0.791 against 0.788, and never worse by more than 0.02 in any of 216 configurations.
- **Other selectors:** the refit kept their 97% coverage with intervals about 8% narrower.

It costs 18 to 34 ms per person at survey sizes.

**The top-pick card was close to no rule at all.** Its old test was "ahead of the runner-up by more than half the leader's rating deviation". Under the staged selector it fired for 76 to 78% of respondents and named the wrong item in 57 to 58% of those claims. Simply naming the highest-rated item was wrong 59% of the time. At these survey lengths a person's top two options are usually too close for their answers to separate.

The card now calls a pick clear only when it beats *every* other option by 1.645 standard deviations of the difference, with the covariance from the refit. That is a one-sided 95% test. It fires for 2 to 4% of respondents. Their claims were wrong 5 to 20% of the time, but that rests on only 10 to 22 claims per configuration, so the rate is rough. Everyone else sees "it's between X, Y, Z", which is true. The refit doesn't replace the stored ratings everywhere. Its wider per-option uncertainty would slow the couple screen's readiness bar, so question selection and that bar still read Glicko.

Everything here is synthetic. Next is whether the "between X, Y, Z" list contains the true favourite, and the same check on real published ranking panels. Code and every number: [`ventures/quick-pick-survey`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/quick-pick-survey), `docs/INFORMATION-GAIN-SELECTOR.md`.
