---
title: "A seeding rule for village rollouts that survives uncertainty in the model fits"
seo_title: "Robust seeding under parameter uncertainty: degree discount"
date: 2026-11-15
tags: [research, networks, diffusion, seeding]
description: "With three contagion models refitted in 500 bootstrap draws, degree discount loses a median 1.0% of adopters; greedy rules tuned to one fit fare worse."
---

The `civ-seeding` programme asks which households a rollout should seed first when nobody knows how adoption actually spreads. It uses the 43 Karnataka villages where a lender introduced microfinance (Banerjee, Chandrasekhar, Duflo and Jackson, 2013). Earlier today's step found that degree discount does well. That is a heuristic from Chen, Wang and Yang (2009) which picks well-connected households and discounts ties to households already seeded. It needs a map of who knows whom but no fitted model, and it lost at most 1.4% of adopters against the best rule under any of three fitted contagion models. The catch was that those three models were point estimates. The scores carried the noise from which villages happened to be sampled, but not the uncertainty in the fitted parameters themselves.

This run closed that gap. In each of 500 bootstrap resamples of the villages, we refitted all three models: simple word of mouth, a threshold model and a reinforcement model. We then scored 23 seeding rules under the three refitted versions, using the same resampled villages, and recorded each rule's worst case. The hypotheses were written down before the run.

The fits move a lot. The word-of-mouth model lands back on its point estimate in only 7% of resamples, and the threshold model's threshold spreads over 0.4 (17% of resamples), 0.5 (37%) and 0.6 (44%). In total, 205 distinct fitted models had to be simulated.

Degree discount held up. Its median worst-case loss was 1.0%, its 95th percentile was 1.6%, and it beat plain top-degree seeding in all 500 resamples. Its one tuning parameter, a rate we had set to 0.05, hardly matters: anything from 0.01 to 0.15 gives 0.9 to 1.2%.

The surprise, which we had not predicted, was what happened to the greedy rules. Greedy search under a fitted model finds the best seeds for that model. When the model is fixed, its worst case stays below 0.7%. When the model is refitted, its 95th percentile rises to 2.4%. Greedy search tuned to the word-of-mouth model reaches 7.3%. A seed set tuned to one estimate pays when the estimate is wrong, and degree discount, tuned to nothing, does not.

We also found a flaw in our own earlier scoring. Rules with random seeds (surveys, friend nomination, random seeding) had been scored on one shared simulated rollout per village, which made their averages noisy. Scored on independent runs, surveying a quarter of households loses 5.0 to 5.1%, not 4.5%. That is exactly at the 5% bar the earlier step said it cleared, so that claim is weaker than we reported. The first run's output is kept in the repository next to the corrected one.

For a model of these villages, then: with a list of who knows whom, degree discount at almost any rate is the safe choice. A greedy plan built on one fitted model is slightly better on average, but it is the riskier bet. This is a fitted model's counterfactual on 43 villages, with a fixed budget and no homophily, not a field result.

Code, the pre-registered plan and full results are in `research/civ-seeding` (LOG.md, 2026-11-15, milestone 6; `experiments/m6_uncertainty/results.txt`). These are models of past adoption, not advice about any real village. This post was written with AI assistance.
