---
title: "Complex centrality, the seeding measure for complex contagions, does not beat degree discount on 43 villages"
seo_title: "Complex centrality vs degree discount on 43 village networks"
date: 2026-11-16
tags: [research, networks, diffusion, seeding]
description: "On 43 village networks, the best complex-centrality rule loses up to 3.7% of adopters, degree discount 1.4%; seeding whole neighbourhoods loses 10 to 13%."
---

The `civ-seeding` programme asks whom a rollout should seed when the data cannot say whether adoption spreads as a simple or a complex contagion. It works on the 43 Karnataka villages where a lender introduced microfinance (Banerjee, Chandrasekhar, Duflo and Jackson, 2013). The earlier steps found that a cheap rule does well. Degree discount (Chen, Wang and Yang, 2009) needs a list of who knows whom but no fitted model, and it loses at most 1.4% of adopters against the best rule under each of three fitted models. One baseline had been on the to-do list since the first seeding step: **complex centrality** (Guilbeault and Centola, 2021). It is the published measure built for the case this programme cannot rule out, a contagion where people need more than one contact before they act.

The measure works like this. Activate a household and all its contacts, run a threshold cascade (a household joins once enough of its contacts have), and see how far and how fast it spreads. Households whose neighbourhoods spread furthest and fastest rank highest. We built it with a fractional threshold of one half (the threshold our fitted model uses), one of one quarter, and the absolute threshold of two contacts that the paper uses most. We scored six rules on it under the same protocol as before: the top households alone, whole neighbourhoods (as the measure assumes), and a version that never seeds two neighbours. The plan and three hypotheses were logged before the run.

The results:

- **No complex-centrality rule matched degree discount.** The best one, with the absolute threshold of two, loses up to 3.7% of adopters. Degree discount's worst case was lower in all 1,000 bootstrap resamples of the villages. The fractional versions lose 4.9 to 7.9%.
- **It does edge out top-degree seeding under the threshold model**, 42.30 adopters per village against 42.11. That is the model where it should help, but the margin is small.
- **Seeding whole neighbourhoods costs a lot**: 10 to 13% of adopters, and with the absolute threshold it does worse than random seeds (12.6% against 12.1%). This matches the earlier finding that on these villages, seeds spread apart beat seeds clustered together.

Why? At a threshold of one half, a seeded neighbourhood rarely reaches past itself on these networks, so the measure mostly ranks by degree (79% of its seeds are top-degree seeds). The models that fit these villages spread *information* by simple word of mouth and apply the threshold only to the decision to adopt. A measure built for contagions where the information itself needs reinforcement is aimed at a different process. So this is not a test of complex centrality on the processes it was designed for. It does mean that for a rollout planned on these data, degree discount remains the rule to use.

The usual caveats hold: point fits, each village's leader count as the budget, seeds that are informed rather than made to adopt, and no homophily. This is a fitted model's counterfactual, not a field result. Next, the programme will score the best complex-centrality rule over the refitted models from the last step and begin the paper draft.

Code, the pre-registered plan and full results are in `research/civ-seeding` (LOG.md, 2026-11-16, milestone 7; `experiments/m7_complex/results.txt`). These are models of past adoption, not advice about any real village. This post was written with AI assistance.
