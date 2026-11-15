---
title: "Seeding a village rollout without a fitted model or a full network census"
seo_title: "Cheap seeding rules for village rollouts, without a fitted model"
date: 2026-11-15
tags: [research, networks, diffusion, seeding]
description: "On 43 village networks, degree discount seeds within 1.4% of the best rule under every fitted model; a 25% survey gives up 4.5%, friend nomination 6.2%."
---

Yesterday's step of the `civ-seeding` programme found that one seeding rule, greedy search under a threshold contagion model, loses at most 0.5% of adopters against the best rule whichever of three fitted models is right. The work uses the 43 Karnataka villages where a lender introduced microfinance through village leaders (Banerjee, Chandrasekhar, Duflo and Jackson, 2013). The catch is that greedy search needs the whole network and a fitted model of how adoption spreads, and a rollout of solar lamps or cookstoves rarely has either. So this run asked how much a rollout gives up with less.

We added three kinds of rule. Each was scored exactly as before: the same three models, each village's own leader count as the seed budget, and 200 simulated rollouts per village. The plan and our predictions were logged before the run.

- **A census of ties but no model.** Spread degree takes households in degree order and skips anyone next to a seed. Single discount and degree discount are two heuristics from Chen, Wang and Yang (2009) that discount ties to households already seeded. Degree discount has one rate parameter, which we set to 0.05, the simple model's fitted rate, and did not tune.
- **A partial survey.** A random 10%, 25% or 50% of households report their ties. Everyone else's degree is estimated from how often surveyed households name them.
- **No network data at all.** Friend nomination, after Kim et al. (2015): ask random households to name a contact, and seed the people named.

Degree discount came within 1.4% of the best rule under all three models. It beat plain top-degree seeding (4.1%) in every one of 1,000 bootstrap resamples of the villages, and under the reinforcement model it tied greedy search. Our guess that simply keeping seeds apart would do as well was wrong. Spread degree never put two seeds side by side, but that pushed its seeds down to 13 ties each, and it lost 3.4%. What greedy search finds, and degree discount copies best, is well-connected households that are rarely each other's neighbours.

The surveys cost less than we feared. Surveying a quarter of households and seeding the highest estimated degree lost at most 4.5%, about what a full census with top-degree seeding loses. The interval is wide, though (1.7 to 9.7%), and the survey beat the census rule in only about a third of the resamples. A 10% survey lost 6.7%. Friend nomination needs no network data at all and lost 6.2%, against 12.1% for random seeds and 10.4% for the lender's own leaders.

So, for a model of these villages: with a list of who knows whom, rank households by degree discount. Without one, a quarter-sample survey costs about one point more than a census, and asking people for a name costs about two. The stakes are modest, since only 7 to 12% of adopters separate the best rule from the worst. All of this is a fitted model's counterfactual, with point fits, a fixed budget and no homophily, not a field result. Next we sweep degree discount's one parameter, score rules over the uncertainty in the fits, and try survey designs closer to the original one, where households name relationships.

Code, the pre-registered plan and full results are in `research/civ-seeding` (LOG.md, 2026-11-15, milestone 5; `experiments/m5_cheap/results.txt`). These are models of past adoption, not advice about any real village. This post was written with AI assistance.
