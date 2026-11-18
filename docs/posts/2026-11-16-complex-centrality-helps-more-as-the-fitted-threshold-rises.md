---
title: "Complex centrality helps more as the fitted adoption threshold rises, and still loses to degree discount"
seo_title: "Complex centrality under uncertain contagion fits: 43 villages"
date: 2026-11-16
tags: [research, networks, diffusion, seeding]
description: "Over 500 refitted bootstrap draws on 43 village networks, complex centrality loses a median 3.3% of adopters; degree discount 1.0%, and it wins every draw."
---

The `civ-seeding` programme asks whom a rollout should seed when the data cannot tell a simple contagion from a complex one. It uses the 43 Karnataka villages where a lender introduced microfinance (Banerjee, Chandrasekhar, Duflo and Jackson, 2013). Earlier today, milestone 7 tested **complex centrality** (Guilbeault and Centola, 2021). This is the published seeding measure built for contagions that need several contacts before anyone acts. Its best version lost up to 3.7% of adopters against the best rule. Degree discount lost 1.4%. Degree discount is a cheap rule that needs a list of who knows whom and no fitted model.

That test scored each rule under three fitted models, each at a single best-fit parameter set. Milestone 6 had already shown those fits are loose. In a bootstrap over villages, the threshold model's fitted adoption threshold lands on 0.4, 0.5 or 0.6 about equally often. Complex centrality is the one rule whose whole premise turns on that threshold. So this step reran milestone 6's 500 bootstrap draws, refitting all three models in each draw, with the six complex-centrality rules added. Everything else stayed the same: code, seeds and scoring. Every one of milestone 6's existing results reproduced exactly. Three hypotheses were logged before the run, and all three held.

- **Degree discount still wins every draw.** Its worst case over the three models was lower than every complex-centrality rule's in all 500 draws. Median worst-case loss: degree discount 1.0% (5–95%: 0.3–1.6%), complex centrality with an absolute threshold of two 3.3% (2.4–5.3%), top-degree seeding 3.9%. Seeding whole neighbourhoods, as the measure assumes, lost 10 to 13%.
- **The best complex-centrality rule beats top degree in 74% of draws.** In milestone 7's narrower bootstrap the figure was 89%. The edge is real but thin.
- **It helps more when the fitted threshold is higher, as its theory says.** Under the threshold model, its median loss is 4.9% in draws where the threshold refits to 0.4, then 3.7% at 0.5, 2.7% at 0.6 and 2.4% at 0.75. Top degree's loss barely moves (4.2% to 3.6%). Degree discount stays between 0 and 1% throughout.

The third result needs a caveat. It compares different bootstrap draws, and a draw that refits to a higher threshold also changes its village weights and other parameters. So it is an association, not a controlled sweep. The next step is to fix the threshold and refit everything else.

For a rollout planned on these data, the advice doesn't change. Degree discount, a rule designed for simple contagions, is also the robust choice when the contagion might be complex. Complex centrality moves the right way as the threshold rises, but on these networks it never catches up. As before, these are a fitted model's counterfactuals, not a field result. Each village's leader count is the budget, seeds are informed rather than made to adopt, and the models include no homophily.

The code, the pre-registered plan and the full tables are in `research/civ-seeding` (LOG.md, 2026-11-16, milestone 8; `experiments/m8_cc_uncertainty/results.txt` and `verdicts.txt`). These are models of past adoption, not advice about any real village. This post was written with AI assistance.
