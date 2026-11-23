---
title: "Village take-up rises with the share of adopting neighbours, but there is no threshold step"
seo_title: "Complex contagion test: take-up by share of adopting neighbours"
date: 2026-11-23
tags: [research, networks, social-science, statistics]
description: "In 43 microfinance villages, take-up climbs smoothly from 11% to 29% with the adopting share of neighbours, which rules out a fixed adoption threshold."
---

Does a new product spread through a village like news, where hearing about it once is enough, or like a behaviour that needs several neighbours to go first? Our `civ-seeding` programme has asked this about the 43 Karnataka villages of Banerjee, Chandrasekhar, Duflo and Jackson (2013), where a lender introduced microfinance through village leaders. We compare three models: simple information spread, a fractional threshold (adopt once 60% of your neighbours have), and reinforcement, where each adopting neighbour raises the odds.

Yesterday's run found a measurement that tells all three apart: take-up among households who *had heard of the product*, binned by the share of their neighbours who adopted. The real survey never asked who had heard, though. It does record who adopted and who knows whom, so this run computed the same bins over all non-leader households in the real villages. That version is weaker, because a household next to many adopters is also more likely to have heard.

The real villages, averaged over villages:

| share of neighbours who adopted | 0 | under 0.4 | 0.4 to 0.6 | 0.6 and up |
|---|---|---|---|---|
| real take-up | 10.9% | 19.0% | 28.8% | 29.1% |
| simple information model | 9.0% | 22.7% | 23.1% | 20.6% |
| threshold model | 10.8% | 20.2% | 19.6% | 43.1% |
| reinforcement model | 10.5% | 22.1% | 22.6% | 16.2% |

None of the three models reproduces the real row. The threshold model predicts a jump past 0.6, and no such jump appears: the real 29.1% is below every one of the threshold model's 200 synthetic datasets (5th to 95th percentile 38.7 to 47.9%). Pooling households instead of averaging villages gives the same answer, 39.7% against 46.4 to 56.6%. The simple and reinforcement models fail the other way. Real take-up keeps climbing between the second and third bins, but in those two models it stays flat near 23%.

The test also works in simulation. With these four moments added to the cross-section, and no awareness question, the models are recovered in 81.5%, 99.5% and 89.5% of synthetic datasets on the data's own scale, up from a lowest 69%. On the real data the simple model now predicts held-out villages best under all three weightings we tried. It beats the threshold model in 0.96 of paired bootstrap draws but beats reinforcement in only 0.835, which is short of decisive. Four of our five pre-registered hypotheses held, and one was inconclusive.

The smooth rise is what a threshold that varies from household to household would produce. Homophily would produce it too: similar households sit next to each other and adopt for the same reasons. The next run fits both. The seeding advice from earlier milestones does not depend on which model is right. Caveats: the share is measured at the survey, after adoption, on one parameter grid, and Monte Carlo error is about ±3 points on each recovery share. Code, the plan written before the run, and full results are in `research/civ-seeding` (LOG.md, 2026-11-23; `experiments/m27_share_real/results.txt`). This post was written with AI assistance.
