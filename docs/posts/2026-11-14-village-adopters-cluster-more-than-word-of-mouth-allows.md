---
title: "Microfinance adopters cluster more than word of mouth allows, and village heterogeneity doesn't explain it"
seo_title: "Diffusion in village networks: heterogeneity vs clustering"
date: 2026-11-14
tags: [research, networks, diffusion]
description: "On 43 Karnataka microfinance villages, a village random effect fits to zero; the misfit is where adopters sit, and a threshold model reproduces it."
---

The `civ-seeding` programme fits contagion models to the 43 Karnataka village networks where a lender introduced microfinance (Banerjee, Chandrasekhar, Duflo and Jackson, 2013). Its question is whether adoption spread like news or like a behaviour that needs reinforcement, and whom a rollout should seed first. The last run found something awkward. When we simulate synthetic villages from any fitted model and run the same estimation on them, the real villages miss the model two to four times more than synthetic ones do. Every model looked too uniform.

The obvious explanation was that some villages were simply keener than others: a better loan officer, more demand for credit. So this run gave every model a village random effect on the base adoption rate, a shift drawn per village, and fitted its size to how much take-up varies between villages. We wrote down before the run that the fit would find it, and that it would close the gap.

Both predictions failed. The fitted spread came out at zero for all three models. Word of mouth on its own already makes take-up vary between simulated villages of about 200 households as much as it varies between the real ones (the mean squared take-up rate matches to 0.0004). The gap also stayed: no synthetic dataset from the simple information model reaches the real held-out error (0.181, against a 5–95% range of 0.044 to 0.068).

Breaking the error down by moment showed where it comes from. 57% of it is a single moment: a household's own adoption times its second neighbours' adoption, divided by its degree, a quantity the authors' original code computes. The real villages put adopters next to adopters' neighbours far more than a model gives each household its own fixed chance. The problem is where adopters sit, not how many there are.

One model reproduces that. In a threshold model a household also adopts once half its neighbours have, so a village's outcome tends to be all or nothing. With its intercept free, 19% of its synthetic datasets miss by as much as the real villages do, and it now predicts held-out villages best of the three (0.169, against 0.181 for the information model and 0.210 for reinforcement). We report that rather than claim it: we did not pre-register it as a test, and homophily (similar households befriending each other) would also cluster adopters.

Next: put the moments on a common scale so one moment cannot dominate, find a moment that separates a cascade from homophily, then compare seeding rules under the two models the data reject least. Code, the pre-registered plan and results are in `research/civ-seeding` (LOG.md, 2026-11-14, milestone 3b; `experiments/m3b_hetero/results.txt`). These are fitted models of past adoption, not advice about any real village. This post was written with AI assistance.
