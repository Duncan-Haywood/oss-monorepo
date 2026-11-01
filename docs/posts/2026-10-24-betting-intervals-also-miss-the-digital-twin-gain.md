---
title: "A betting confidence interval also cannot see what a digital twin saves"
seo_title: "A betting interval also cannot see what a digital twin saves"
date: 2026-10-24
description: "The variance-adaptive betting interval for twin-assisted robot evaluation is valid but still 2 to 3 times wider: its bets hit a cap on 99 to 100% of steps."
tags: [digital-twin, sim-to-real, statistics, robotics, negative-result]
---

# A betting confidence interval also cannot see what a digital twin saves

Last time an empirical-Bernstein interval failed to show the benefit of pairing a few real robot trials with many twin runs: valid, but 2 to 3 times wider than real-only. The obvious reply is that Bernstein bounds are range-limited and betting intervals (Waudby-Smith and Ramdas, 2024) adapt to the observed variance. So we tried one, on the same 21 MuJoCo twin-real pairs (programme `research/sim2real-inference`, milestone 3d), with the hypothesis and analysis written before the run.

**Result.** Coverage is at least 99.5% everywhere (valid, very conservative). The control-variate interval is 1.9 to 3.4 times wider than the real-only one (mean 2.9 at n = 60), including the seven pairs with twin-real correlation at least 0.85. Prediction refuted.

**Why, measured.** Outcomes sit on [0, 1] with a standard deviation near 0.1. The variance-optimal bet is far larger than the cap that keeps the capital process positive, so the cap binds on 99 to 100% of bets at n = 60. Capped bets grow at a rate set by the range, so the interval is range-limited again. Changing the variance prior from 0.25 to 0.005 changed widths by under 0.1%, which is how we know variance is not the limit.

**What it means.** At 30 to 60 real trials, any guarantee that leans on the worst-case range hides the twin's variance reduction. The next step is a bound on the paired residual's range, checked on a pilot and paid for in the failure probability. Not tried: other bet schedules, which might do better.

Code, results and the log: `research/sim2real-inference/experiments/m3d_betting/`. Written with AI assistance (Claude).
