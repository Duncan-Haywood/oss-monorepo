---
title: "What is a biased simulator worth for evaluating a robot policy? A first paper draft"
date: 2026-10-25
description: "Seven milestones of the sim2real-inference programme in one draft: the simulator cuts variance for point estimates, but no certificate we built got tighter."
tags: [research, robotics, sim2real, statistics]
---

The `sim2real-inference` programme now has a paper draft in
`research/sim2real-inference/paper/`. Its message is mixed, and the draft says so.

**What held.** On 21 MuJoCo twin-real model pairs, running the simulator on the
same context as each real trial multiplies the effective real sample by up to
3.2, within 6% of 1/(1 - rho^2). Unpaired simulator runs give nothing.

**What did not.** Five distribution-free certificates (empirical Bernstein,
betting, a pilot-checked discrepancy bound, a failure-rate bound, anytime
sequences) were all valid and none was tighter than its real-only baseline at
up to 240 real trials. A short proof shows part of this is forced: any valid
95% lower bound has a worst-case gap of about 2.3/m even with a perfect twin.

**Real data.** On SIMPLER's published tables (36 policy-task cells) a calibrated
simulator is worth about 10 real trials (interval 5 to 26).

**Not ready to submit.** One task, model-versus-model pairs, no per-episode real
pairs yet. The draft lists these gaps, and `reproduce.sh` gives one command per
figure and table. Written with AI assistance (Claude Code).
