---
title: "Homophily with no contagion fits village adoption data better than four contagion models"
seo_title: "Homophily vs contagion in 43 microfinance village networks"
date: 2026-11-23
tags: [research, networks, social-science, statistics]
description: "A model where neighbours share a propensity to adopt, and no one is swayed by adopters, beats every contagion model on held-out villages."
---

Our `civ-seeding` programme asks whether technology adoption spreads through village networks as a simple contagion, where one informed contact is enough, or a complex one, where you need several adopting neighbours. It works on the 43 Karnataka microfinance villages of Banerjee, Chandrasekhar, Duflo and Jackson (2013). Two runs earlier today narrowed things to one awkward number. Among households where 40 to 60% of their neighbours adopted, 28.8% adopted themselves. None of the four contagion models we fitted got above 25.2% there, in any synthetic dataset.

This run tested the rival everyone in network research worries about: homophily. People who are tied to each other tend to be alike (McPherson, Smith-Lovin and Cook 2001). If alike people adopt alike, take-up rises with the share of adopting neighbours even though nobody is influenced by anybody. Shalizi and Thomas (2011) showed the two are confounded in observational data in general. So the question here was narrower and testable: does a homophily model fit *these* data as well as contagion does?

The new model keeps the original information model's word of mouth: informed households pass the news on. It drops every effect of adopting neighbours on the decision. Instead, each household's chance of adopting carries a hidden propensity, part of which it shares with its neighbours. We added 1,200 points of it to the existing grid and wrote the plan and five hypotheses down before running it. Take-up among non-leader households, by share of adopting neighbours:

| share of neighbours who adopted | 0 | under 0.4 | 0.4 to 0.6 | 0.6 and up |
|---|---|---|---|---|
| real villages | 10.9% | 19.0% | 28.8% | 29.1% |
| homophily, no contagion | 10.0% | 20.8% | 29.5% | 27.9% |
| threshold per household | 10.5% | 20.8% | 22.7% | 30.9% |
| simple information model | 9.0% | 22.7% | 23.1% | 20.6% |

The homophily model is the first to reach the middle bin. The real 28.8% sits inside its 5th to 95th percentile band over 200 synthetic datasets (26.4 to 32.5%), and so does the top bin. It also predicts villages it was not fitted on better than any contagion model. On the data's own scale its held-out loss is 11.86, against 13.13 to 14.61 for the four contagion models, and it wins in at least 95.7% of paired bootstrap draws against each one. That came out stronger than we predicted: we had expected an inconclusive result.

The finding has limits, and we want to be clear about them. The best fit sits at the edge of the grid on two parameters, so a stronger version wasn't searched. The model is recovered from its own synthetic data only 75.5% of the time. When you fit only contagion models to homophily data, they read it as simple contagion or reinforcement, which is exactly the trap. And word of mouth is still in the model, so information does spread. What the run shows is that this cross-section's evidence for *adoption influence* is matched or beaten by a propensity that neighbours share. It does not show the villages have no influence. Only an experiment that randomises who gets seeded, like Beaman et al. (2021), can separate the two.

Next we extend the grid past its edges and fit a mixed model with homophily and reinforcement together, to see if any influence survives. We also want to re-check the programme's seeding advice under the homophily model, because when neighbours adopt for their own reasons, seeding the right household may matter less. Code, the pre-run plan and full results are in `research/civ-seeding` (LOG.md, 2026-11-23; `experiments/m29_homophily/results.txt`). This post was written with AI assistance.
