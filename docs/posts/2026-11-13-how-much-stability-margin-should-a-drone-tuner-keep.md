---
title: "How much stability margin should a drone tuner keep? 0.8 of the ceiling, and no less"
date: 2026-11-13
tags: [codesign-cant, quadrotor, stability, cma-es, pid, research]
description: "Sweeping the stability margin in simulated quadrotor tuning: 0.9× the gain ceiling still diverges, 0.8× does not, and tighter buys nothing more."
seo_title: "Stability margin sweep for quadrotor controller tuning with CMA-ES"
---

The [last step](2026-11-13-a-stability-margin-as-a-training-constraint-costs-under-one-percent.md) made our tuner keep a stability margin. The tuner is an evolutionary optimiser (CMA-ES) co-designing simulated quadrotors with canted rotors. The margin keeps each design's attitude integral gain at or below 0.8 times the largest value a linear model calls stable at every corner of the plant uncertainty. That cost about 0.7% of held-out performance. It also removed every divergence that appeared when the tilt-command limit was raised from 20° to 45°.

One margin is a data point, not a design rule. So this step swept it: the integral gain bounded at 1.0, 0.9, 0.8, 0.7 and 0.6 times its ceiling. That meant 48 new CMA-ES runs of 3,200 evaluations, about 68 minutes on four cores. All seven sets of designs, the unconstrained one included, were scored on the same 64 held-out flights per design. We wrote seven predictions into the [research log](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/research/codesign-cant/LOG.md) first.

**The optimiser always goes to the edge.** Whatever bound it was given, it sat on it. At the loosest bound, the trained designs' integral gain could rise only 1.00 to 1.07 times before the linear model called them unstable. At the tightest (0.6×), it could rise 1.67 to 1.74 times, against the 1.67 the bound requires. That is the same behaviour that caused the problem in the first place. A tuner spends whatever margin it is allowed.

**0.8 is the knee.** With the tilt limit at 45°, the unconstrained designs diverged on 13 of 384 held-out flights. Requiring only that every plant corner be stable (1.0×) left 9. At 0.9× there were still 3. At 0.8×, 0.7× and 0.6× there were none. At twice the centre-of-pressure lever the designs were trained on, the counts fell the same way and stopped at 0.8×: 4 of 384 with a 20° limit, 12 with a 45° limit, the same at 0.7× and 0.6×.

**Tighter costs nothing more.** The cost penalty was about 0.011 at every bound from 0.9× down to 0.6×, and position error stayed at 0.105 m in every set. With less integral gain allowed, the optimiser leaned on the other gains instead (integral-to-proportional ratio 3.6 to 4.3 per second at the loosest bound, 2.4 to 3.2 at the tightest).

**What we got wrong.** We expected the price to rise steadily with the margin. Instead it stepped once and went flat. We also expected 0.9× to be enough, and it wasn't. Three of our seven predictions failed or held only in part.

**For a builder:** if you put a linear stability check in a tuning loop, bound the integral gain at 0.8 of its ceiling or a little below. "Stable at every plant corner" is not enough on its own.

All of this is simulated: one simulator and one geometry, assumed plant ranges, six seeds, and a margin on the integral gain only. The divergences that remain at twice the trained lever don't respond to the margin and need another explanation. Code, results and figure: [`research/codesign-cant`](https://marisstella.app/research/codesign-cant/) (`experiments/m7f_sweep/`).
