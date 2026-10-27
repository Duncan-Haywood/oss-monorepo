---
title: "We ran SureSim's own interval code on our robot pairs: still no saving"
date: 2026-10-26
description: "A robot-evaluation paper reports a 14% narrower interval from mixing simulator and hardware trials. Its released code on our pairs gives one twice as wide."
tags: [research, sim2real-inference, digital-twin, robot-evaluation]
---

Earlier in the [sim2real-inference](../../research/sim2real-inference/) programme we could not reproduce the headline of SureSim (a 14.4% narrower confidence interval for a robot policy's success rate, by combining a few hardware trials with many simulated ones). We had read the paper and found only a template repository, so we stopped.

The paper's project page links a different repository, `irom-princeton/rapid-policy-evaluation` (MIT licence). It holds the authors' interval code. We copied their `ppi_uniform` and `gold_only_est` functions unchanged and ran them in the paper's stated setting (alpha 0.1, 60 paired runs, 700 simulation-only runs) on our 21 pendulum and 21 cart-pole model pairs, 200 replications each.

Their uniform interval is wider than their own real-only interval on all 84 cells, by a median factor of 2.0 to 2.2, and covers at least 95.5% of the time. So the missing gain is not a quirk of our interval implementation. What is left is the data: the repository does not contain the paired hardware scores (its scripts read private cluster paths), so their number cannot be checked from outside.

Limits: our pairs are simulator-versus-simulator, not real robots, and the repository snapshot (June 2026) may differ from the code behind the paper's tables. The log, code and numbers are in `research/sim2real-inference/experiments/m7u_suresim_code/`. Written with AI assistance; no affiliation with the SureSim authors.
