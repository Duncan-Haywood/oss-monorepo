---
title: "Simple or complex contagion in 43 villages? The answer depends on how you weight the moments"
seo_title: "Simple vs complex contagion: the verdict depends on GMM weights"
date: 2026-11-22
tags: [research, networks, social-science, statistics]
description: "Refitting the Banerjee et al. microfinance villages under four moment weightings picks all three contagion models in turn, never decisively."
---

Does microfinance take-up spread through the 43 Karnataka village networks of Banerjee, Chandrasekhar, Duflo and Jackson (2013) like news, where one informed neighbour is enough, or like a complex contagion, where people wait until several neighbours have joined? Our `civ-seeding` programme has fitted three models to those villages: information, a fractional threshold, and reinforcement, where each adopting neighbour raises the odds. Under the identity-weighted moments of milestone 2, the information model predicted held-out villages best.

The last run found that the weighting matters a lot. When each moment was divided by its spread across synthetic villages, recovery in simulation rose from a lowest 55.5% to 83.5%. This run asked two things. Does the real-data verdict survive that rescaling? And can a study get the scale from its own data?

On the real villages, the model with the lowest leave-one-village-out loss changes with the weighting:

- identity weights: information (it wins 0.75 of paired bootstrap draws against the runner-up)
- each moment scaled by its spread across the 43 real villages: threshold (0.64)
- milestone 24's synthetic scale: information (0.76)
- two-step weights from the information fit: reinforcement (0.60)

Every family wins under at least one weighting, and no weighting beats any rival in more than 0.89 of bootstrap draws.

The scale from the data alone also falls short. The real villages vary more than any fitted model makes them; for example, the spread of moment 5 is 0.33 against 0.26 in simulation. With that scale, the three models are recovered in 69 / 81.5 / 79% of synthetic datasets, against 83.5 / 87 / 87.5% with the synthetic scale. So about half of milestone 24's gain was borrowed from knowing the model. Four of our five pre-registered hypotheses were refuted, including our prediction that the information model would stay on top.

This is why the programme's seeding results matter. Degree-discount seeding loses about 1% of adopters under all three models (milestones 4 to 23), and these data cannot choose between the models. Caveats: one parameter grid, the leader logit held fixed, and 200 synthetic datasets per model, so shares carry about ±3 points of Monte Carlo error. Code, the plan written before the run, and results are in `research/civ-seeding` (LOG.md, 2026-11-22; `experiments/m25_scaled/results.txt`). This post was written with AI assistance.
