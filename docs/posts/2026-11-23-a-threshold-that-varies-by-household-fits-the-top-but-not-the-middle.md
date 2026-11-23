---
title: "A threshold that varies by household fixes the top of the village share profile, not the middle"
seo_title: "Heterogeneous adoption thresholds on 43 microfinance villages"
date: 2026-11-23
tags: [research, networks, social-science, statistics]
description: "Giving each household its own adoption threshold fits take-up past a 0.6 adopting share in 43 villages, but no contagion model reaches the 0.4 to 0.6 bin."
---

Earlier today our `civ-seeding` programme found that in the 43 Karnataka microfinance villages of Banerjee, Chandrasekhar, Duflo and Jackson (2013), take-up rises smoothly with the share of a household's neighbours who adopted. There is no jump past a share of 0.6, which is what a fixed adoption threshold predicts. The obvious repair is a threshold that differs from household to household, the classic idea from Granovetter (1978) and Watts (2002). This run tested it, with the plan and five hypotheses written down before the code ran.

In the new model each household draws its own threshold from a Beta distribution with mean μ and concentration κ. We added 750 points of it to the existing grid of 850 and refitted on the real villages. The best fit is a high, widely spread threshold: μ = 0.75, κ = 5, so about one household in five has a threshold below 0.6. Take-up among non-leader households, by share of adopting neighbours:

| share of neighbours who adopted | 0 | under 0.4 | 0.4 to 0.6 | 0.6 and up |
|---|---|---|---|---|
| real villages | 10.9% | 19.0% | 28.8% | 29.1% |
| fixed threshold | 10.8% | 20.2% | 19.6% | 43.1% |
| threshold per household | 10.5% | 20.8% | 22.7% | 30.9% |
| simple information model | 9.0% | 22.7% | 23.1% | 20.6% |

Spreading the threshold fixes the top bin. The real 29.1% now sits inside the model's 5th to 95th percentile band (26.7 to 35.2%), where every one of the fixed threshold's 200 synthetic datasets was at least 38.7%. The middle bin does not move: 22.7% against the real 28.8%, and none of the four models puts it above 25.2% in any dataset. A contagion that works through the share of adopting neighbours can't lift the middle bin without lifting the top one too. Homophily, where similar households sit next to each other and adopt for the same reasons, could. So could the fact that the share is measured at the survey, after adoption.

Does the real data prefer the new model? Only weakly. On the data's own scale it predicts held-out villages best, with a loss of 13.13 against 13.39 for simple contagion, but it wins in only 65% of paired bootstrap draws. It beats the fixed threshold in every draw. In simulation it is recovered from its own synthetic data 77% of the time, and adding it leaves the other models' lowest recovery at 81.5%. Two hypotheses held, two were refuted (the profile fit and a decisive win) and one was inconclusive. The fit sits at the top of the μ grid, so a higher mean was not searched.

The next step is a homophily process, as the rival explanation for that middle bin. The seeding advice from earlier milestones does not depend on which model is right. Code, the pre-run plan and full results are in `research/civ-seeding` (LOG.md, 2026-11-23; `experiments/m28_hetero/results.txt`). This post was written with AI assistance.
