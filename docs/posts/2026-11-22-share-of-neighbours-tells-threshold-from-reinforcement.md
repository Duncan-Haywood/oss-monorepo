---
title: "Count or share? One survey question would tell a contagion threshold from reinforcement"
seo_title: "Telling threshold from reinforcement contagion with one question"
date: 2026-11-22
tags: [research, networks, social-science, statistics]
description: "Binning take-up among aware households by the share of adopting neighbours identifies all three contagion models in 96.5% or more of simulated datasets."
---

Does a new product spread through a village like news, or does each household wait until enough of its neighbours have joined? Our `civ-seeding` programme fits three models to the 43 Karnataka microfinance villages of Banerjee, Chandrasekhar, Duflo and Jackson (2013). In the information model one informed neighbour is enough. In the fractional threshold model a household adopts once a share of its neighbours has. In the reinforcement model each adopting neighbour raises the odds a little.

The cross-section in the original data cannot tell these apart. Two runs ago we tried adding one question to a hypothetical end-line survey: "have you heard of the product?". It worked for two of the three models. It separated the information model from reinforcement (91% recovery each), but the threshold model fell to 73.5%, and 22% of its simulated datasets were called reinforcement. We had binned take-up among aware households by the *count* of adopting neighbours, and under both complex models that take-up rises with the count.

A threshold, though, acts on the *share*. So this run bins the same awareness data by the share of a household's neighbours who adopted: none, under 0.4, 0.4 to 0.6, and 0.6 or more. We fixed those edges before the run and logged five hypotheses first.

Among aware households with at least 60% of neighbours adopting, 78% have adopted under the threshold model. Under the information and reinforcement models the figure is 26 to 27%. Given that gap, leaving one village out, with each moment scaled by its spread across the dataset's own villages (a scale a real study could compute):

| what the survey records | information | threshold | reinforcement |
|---|---|---|---|
| adoption only | 69.0% | 81.5% | 79.0% |
| + awareness, binned by count | 92.5% | 83.0% | 98.5% |
| + awareness, binned by share | 94.5% | 100% | 99.0% |
| + both | 96.5% | 100% | 99.0% |

With 20 villages instead of 43, both bin sets together still recover each model in 85.5% or more of datasets. The best design two runs ago reached 64% at 20 villages. The last run's worry was that a study can't borrow a scale from simulated data. Once the awareness question is asked, that worry mostly goes away.

The caveat belongs to the model. Our threshold is deterministic and the same for every household, so every aware household past 0.6 adopts, and that leaves a large fingerprint. A threshold that differs between households, or one that only raises the chance of adopting, would blur it. The next step is to add such a process and see how fast the 100% fades. The real survey also never asked about awareness, so this is advice for designing a new study, not a verdict on these 43 villages. The data do contain take-up by share among *all* households, so that real-data check comes next.

Code, results and the log entry with its plan are in [`research/civ-seeding`](../../research/civ-seeding/README.md) (milestone 26).
