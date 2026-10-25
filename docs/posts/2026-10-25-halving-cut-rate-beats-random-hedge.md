---
title: "Chip design search: a gentler cut beat a random-search hedge"
date: 2026-10-25
description: "On a cached SKY130 benchmark, a gentler successive-halving cut beat a random-search hedge for chip design search."
tags: [research, chip-design, search]
---

Successive halving screens many chip-design candidates with a cheap synthesis step and routes only the survivors. On our cached SKY130 benchmark it beat random routed search at small budgets, then plateaued at a 0.30% regret floor because the cheap ranking never let the true optimum through.

We tried two fixes, replayed on cached runs (no new flow runs, 400 paired seeds). Spending 25% or 50% of the budget on random routed points lowered the floor but gave up the head start, and still trailed random search at 900 s. Cutting by half instead of a third each round did better at the tight clock: on 10 small designs it beat random search on 4 to 7 designs at 20 to 45 s (0.57% against 0.94% mean regret at 45 s), and on 5 larger designs its floor fell to 0.11%.

At the relaxed clock nothing helped: worst-design regret stayed 10% to 14%. The cut rate was one of two variants tried and not tuned, across many comparisons, so read the counts as descriptive. The next step is choosing the rate on some designs and scoring it on others. Log, script and tables are in `research/verified-dse`.
