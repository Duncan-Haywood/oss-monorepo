---
title: "Once homophily is in the model, village adoption data ask for no contagion on top"
seo_title: "Village adoption: no contagion needed beyond homophily"
date: 2026-11-24
tags: [research, networks, social-science, statistics]
description: "Adding peer reinforcement to the homophily model of 43 microfinance villages makes held-out prediction worse, though the test has limited power."
---

Two days ago our `civ-seeding` programme found that a model with no adoption influence at all fits the 43 Karnataka microfinance villages of Banerjee, Chandrasekhar, Duflo and Jackson (2013) better than four contagion models. In that model, news of the loan still spreads by word of mouth, but nobody adopts *because* a neighbour adopted. Neighbours simply share part of their propensity to adopt (homophily). Two questions were left open. Was that win an artefact of where the parameter grid stopped? And if you put homophily *and* contagion in one model, do the data still want the contagion part?

This run answered both. The plan and five hypotheses were pushed before the run. We extended the homophily grid past its edges (3,000 points) and built a mixed model: the same shared propensity, plus reinforcement, where each adopting neighbour raises a household's adoption log-odds by 0.05, 0.10 or 0.20. Everything is scored the way the programme has scored models since milestone 27: leave one village out, fit on one simulation seed, score on another. The moments include take-up binned by the share of a household's neighbours who adopted.

| model | held-out loss (lower is better) | extended homophily beats it in |
|---|---|---|
| simple information spread | 13.39 | 98.5% of bootstrap draws |
| threshold per household | 13.13 | 90.9% |
| homophily, milestone 29 grid | 11.86 | 63.5% |
| **homophily, extended grid** | **11.74** | – |
| homophily plus reinforcement | 12.34 | **99.2%** |

Extending the grid changed little: 11.74 against 11.86. Adding reinforcement made things worse. The best mixed fit predicts held-out villages worse than homophily alone (difference +0.60, 95% interval +0.15 to +0.99; homophily better in 30 of the 43 villages). It also fits worse in sample, even though its grid contains the best homophily shape with the smallest reinforcement. The preference comes from the share-of-neighbours moments, the ones built to tell contagion from homophily. On the plain cross-section alone, neither model wins.

The catch is power. We simulated 200 datasets from the fitted mixed model and ran the same race. It named the mixed model only 53.5% of the time, and homophily alone still won the held-out comparison on a third of them. So the honest claim is narrow. The cross-section shows no evidence of adoption influence beyond homophily, and some evidence against reinforcement of strength 0.1. It cannot rule out a small one. Observational network data confound homophily and contagion in general (Shalizi and Thomas 2011). A randomised seeding design, as in Beaman et al. (2021), would separate them cleanly.

For practitioners, the useful part is that the seeding advice doesn't depend on which story is true. Milestone 30 showed degree discount stays within 1.8% of the best seeding rule under every model family the data cannot reject.

There are limits. Reinforcement below 0.05 was not searched. The homophily fit still sits at the edge of the intercept grid. We used one form of homophily (a network-smoothed Gaussian) on a fixed network. Next is a calibrated test that places the real +0.60 within the mixed model's own distribution of contrasts. These are results about fitted models of past adoption, not advice about any real village. Code, the plan and full results are in `research/civ-seeding` (`LOG.md`, 2026-11-24; `experiments/m31_mixed/results.txt`). This post was written with AI assistance.
