---
title: "Survey half a village in two visits and you can seed a rollout almost as well as with a full network census"
seo_title: "Seeding with a partial network survey: 43 village networks"
date: 2026-11-16
tags: [research, networks, diffusion, seeding]
description: "On 43 village networks, a two-stage survey of half the households plus degree discount loses 1.6% of adopters; a full census 1.4%, a random half 3.3%."
---

The `civ-seeding` programme asks whom a rollout should seed when the data cannot tell a simple contagion from a complex one. It uses the 43 Karnataka villages where a lender introduced microfinance (Banerjee, Chandrasekhar, Duflo and Jackson, 2013). Earlier milestones found one robust answer: **degree discount** (Chen, Wang and Yang, 2009), which picks well-connected households but discounts ties to households already chosen. Under every model the data cannot reject, it loses about 1.4% of adopters against the best rule. The catch is that it needs the whole network: who knows whom, for every household.

Mapping every tie in a village is expensive. Milestone 5 tried the cheap version: survey a random quarter of households, ask each for its ties, and rank by estimated degree. Corrected for noise in milestone 6, that loses about 5%. This step asked whether *how* the households are chosen matters as much as how many.

We compared three designs at the same interview budget (10%, 25% or 50% of households):

- **uniform**: everyone surveyed is drawn at random;
- **adaptive**: half the budget at random, then the households the first half named most often;
- **walk**: half at random, then households named by randomly chosen first-round respondents.

Each survey fed two rankings: top estimated degree, and degree discount using only the ties the survey saw. Three hypotheses were logged before the run. One held and two failed.

- **An adaptive second visit does not help ranking by degree.** At a quarter, it loses 5.9% against 5.2% for a plain random sample, and it was worse in every one of 1,000 bootstrap draws. The walk design was worse still.
- **Degree discount helps a little on a random sample.** On a uniform quarter it beats estimated degree by 0.2 point; on a uniform half by 1.1 points.
- **A quarter survey still cannot match a full census ranked by degree.** The best quarter-sample rule loses 4.5%; top degree on a full census loses 4.1%.

The result we did not predict is that the adaptive visit and degree discount need each other. Together, at half the households, they lose **1.6%** of adopters (90% interval 1.3–2.0%). That is within 0.2 point of degree discount on a full census, and half the loss of the same ranking on a random half (3.3%). Our reading, not yet tested: the second visit interviews exactly the households most likely to be picked as seeds, so the ties between candidate seeds get seen, and the discount has something to act on. Ranking by degree alone has nothing to discount, so the second visit only costs it a noisier estimate.

For someone planning a rollout on networks like these, the practical version is: if you can interview half the village, do it in two rounds (a random half, then the most-named) and rank by degree discount on the ties you were told about. With a quarter, the same design gets you about what a full census ranked by degree would. With less, a plain random sample is best.

These are a fitted model's counterfactuals on 43 villages, not a field trial. They use the point fits only; households are assumed to report every tie, and the most-named households are assumed findable. Each village's leader count is the budget. The code, the pre-registered plan and every number are in `research/civ-seeding` (LOG.md, 2026-11-16, milestone 9; `experiments/m9_survey/results.txt`). These are models of past adoption, not advice about any real village. This post was written with AI assistance.
