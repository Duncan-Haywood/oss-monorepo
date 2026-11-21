---
title: "One end-line question tells news from reinforcement, and the weighting mattered more"
seo_title: "Simple vs complex contagion: which survey data identifies it"
date: 2026-11-21
tags: [research, networks, diffusion, identification, surveys]
description: "On 43 real village networks, asking who has heard of a product tells simple contagion from reinforcement 91% of the time, but not a threshold model."
---

The `civ-seeding` programme asks whether a new product spreads through the 43 Karnataka village networks of Banerjee, Chandrasekhar, Duflo and Jackson (2013) like news, where one informed contact is enough, or like a behaviour that needs reinforcement from several adopters. [Milestone 3](../../research/civ-seeding/README.md) found that the survey those authors had, one cross-section of who adopted, cannot reliably tell the two apart. Given synthetic data from each of three fitted models, leaving one village out picks the right model only 58.5% (news), 82% (threshold) and 55.5% (reinforcement) of the time. Later milestones showed that whom to seed hardly depends on the answer. An evaluator still wants to know what it would cost to find out. That was the proposal's third question, and it had never been run.

**Two cheap additions.** One is an end-line question: "have you heard of the product?" The other is the date each household took up, which a lender has in its loan records. The simulator now records both, using the same random draws as before, so the cross-section-only case reproduces milestone 3's numbers exactly. Each addition gives five new moments for the same fitting harness. Hypotheses were written into the [log](../../research/civ-seeding/LOG.md) before the run.

| leave one village out, 43 villages | news | threshold | reinforcement |
|---|---|---|---|
| cross-section only | 58.5% | 82.0% | 55.5% |
| + awareness question | 91.0% | 73.5% | 91.5% |
| + awareness, 15% of aware households say no | 86.5% | 73.0% | 90.0% |
| + adoption dates (trimester) | 71.0% | 80.0% | 72.5% |
| + both | 93.5% | 75.0% | 92.0% |

**Awareness splits news from reinforcement.** Under the news model, a household that has heard decides on its own, so take-up among the aware is flat in how many neighbours adopted (25.2% with none, 26.1% with three or more). Under reinforcement it climbs (20.4% to 29.0%). Misreported answers barely dent this. Awareness also cures the in-sample criterion's habit of picking the bigger model whatever made the data: recovery in sample goes from 27% to 98.5% for the news model.

**It does not split threshold from reinforcement.** Take-up among the aware rises with adopting neighbours under both, so 22% of threshold datasets are called reinforcement once awareness is added. That refuted the hypothesis that awareness alone would reach 80% for every model. Dates at trimester resolution add little, about 1.5 points on top of awareness.

**Villages matter as much as the questionnaire.** With 20 villages instead of 43, the best design recovers every model in only 64% of datasets. With 10, it is under half.

**The biggest effect was not a measurement.** As a secondary analysis we scaled each moment by its spread instead of weighting all moments equally, which is what the authors' code and milestone 3 do. That alone lifts the plain cross-section to at least 83.5% for every model. Under equal weights, one large-scale moment dominates. So part of "these data cannot tell the models apart" was the weighting, not the data. The scale here came from the synthetic datasets; a real study would estimate it from its own bootstrap, which is the next step.

This is identification by simulation on the real networks, with three model families and no homophily, so these recovery rates are for these models and this estimator, not a guarantee for a field study. Code and numbers: [`run.py`](../../research/civ-seeding/experiments/m24_measure/run.py), [`results.txt`](../../research/civ-seeding/experiments/m24_measure/results.txt), [`measure.py`](../../research/civ-seeding/src/civ_seeding/measure.py), and the [programme page](../../research/civ-seeding/README.md). Written with AI assistance (Claude Code).
