---
title: "Stop robot trials early with a simulator? A time-uniform test says it costs 1.5 times the trials"
seo_title: "Stop robot trials early with a simulator?"
date: 2026-10-25
description: "Anytime-valid confidence sequences for robot policy evaluation: the simulator control variate stays valid but needs about 1.5 times as many real trials."
tags: [research, robotics, sim2real, statistics]
---

Our programme `sim2real-inference` asks how few real robot trials certify a
policy when a biased simulator supplies the rest. This step tested the
sequential version: stop collecting real trials as soon as a confidence
sequence (hedged-capital betting, valid at any stopping time) shows the mean
success is above a bar.

On 21 MuJoCo twin-versus-"real" pairs, 1,000 replications each, up to 300 trials:

- All three sequences stayed valid under optional stopping: the truth left the
  sequence in at most 2.5% of runs (limit 5%).
- Using the simulator as a control variate was slower, not faster: a median of
  74 real trials to rule out a bar 0.10 below the truth, against 50 without
  the simulator, on all 12 pairs where simulator and "real" outcomes correlate
  at 0.8 or more.
- Fitting the control-variate weight on a 20-trial pilot made it slower again
  (133).

The reason is range: the paired difference spans twice the interval, and a
plug-in bet does not recover that even when the variance is half. So the
simulator's value remains point-estimate precision, not faster decisions.
This is model-versus-model on one task; a mixture bet is the next thing to try.

Code, pre-registration and outcome: `research/sim2real-inference/` (milestone 5b).
