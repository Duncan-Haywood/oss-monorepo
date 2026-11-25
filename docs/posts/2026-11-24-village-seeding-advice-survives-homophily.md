---
title: "Whom to seed in a village network: the advice survives homophily, but the prize shrinks a fifth"
seo_title: "Village network seeding advice survives homophily"
date: 2026-11-24
tags: [research, networks, social-science, statistics]
description: "Fifteen seeding rules re-scored under the homophily model that fits 43 microfinance villages best: same ranking, smaller gain."
---

Yesterday our `civ-seeding` programme found an awkward result. On the 43 Karnataka microfinance villages of Banerjee, Chandrasekhar, Duflo and Jackson (2013), a model with no adoption influence at all fits the data better than four contagion models. In that model neighbours simply share part of their propensity to adopt (homophily). Most of the programme's practical advice, about which households a rollout should seed first, had been worked out under contagion models. If adopters do not sway their neighbours, does that advice still hold?

This run re-scored 15 seeding rules under all five model families the data cannot reject: simple information spread, a fixed adoption threshold, reinforcement, a threshold drawn per household, and homophily. We also tried two variants of the homophily fit, because it sits at the edge of the fitted grid. The plan and six hypotheses were written down and pushed before the run. Each rule seeds as many households as the lender's leaders did in each village (1,140 in all), scored over 200 simulations per village.

Most of the advice held.

| | information model | homophily model |
|---|---|---|
| gain of the best rule over seeding the leaders | 6.8% more adopters | 5.3% more adopters |
| degree discount, regret against the best rule | 1.6% | 1.3% |
| greedy seeding tuned to the information model, regret | 0.2% | 0.5% |
| seeding the highest-degree households, regret | 3.4% | 2.6% |

The two models rank the 15 rules almost the same way (Kendall's tau 0.94). Degree discount needs a list of who knows whom but no fitted model. Across all five families its worst loss against the best rule is 1.8% (bootstrap 1.4 to 2.2%). One rule we did not single out in the plan came out best everywhere: greedy seeding tuned to the per-household threshold model. It was the best rule under six of the seven processes and within 0.05% of the best under the seventh.

One hypothesis failed. We expected homophily to cut the payoff of choosing seeds well by at least a quarter. It cut it by about a fifth: the gain under homophily is 0.81 of the gain under the information model (bootstrap 0.78 to 0.84). That makes sense. Under homophily the word of mouth still spreads, so who hears first still matters, but nobody's adoption pulls a neighbour along with it.

The run also caught a flaw in our own harness. The earlier milestones scored "random seeds" by running all 200 random seed sets on one shared random draw. Under the contagion models that barely mattered: the random rule's regret moves from 6.9% to 6.6% once each set gets its own draws. Under homophily, one shared draw means one shared hidden propensity field per village, and it made random seeds look like the *best* rule. Its bootstrap interval ran from 0 to 5.2%, which gave it away. The pre-run plan had specified independent draws, so we fixed the harness to match the plan and kept the old score only as a reproduction check. The earlier conclusions about random seeds stand.

There are limits. None of the rules can see the hidden propensity, so a planner who could observe it might do better. These are point fits, and the homophily fit still sits at two grid edges. Each rule gets one Monte Carlo copy, which earlier milestones showed is noisy below about half a point. Next we check whether greedy seeding under the per-household threshold keeps its zero worst-case regret over 500 refitted bootstrap models. These are results about fitted models of past adoption, not advice about any real village. Code, the plan and full results are in `research/civ-seeding` (`LOG.md`, 2026-11-24; `experiments/m30_homophily_seeding/results.txt`). This post was written with AI assistance.
