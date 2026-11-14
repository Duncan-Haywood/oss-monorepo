---
title: "Shaking a decayed shear wall back and forth does not explain its lost strength"
date: 2026-11-14
tags: [buildbot-sheathing, shear-wall, timber-engineering, hysteresis, opensees, real-data]
seo_title: "Does cyclic loading explain strength loss in decayed wood shear walls?"
description: "Under the CUREE protocol with pinching nails fitted to Weiss's materials, a decayed 3 in shear wall keeps 70.6% against 70.5% pushed once. Tests kept 34%."
---

The `buildbot-sheathing` programme asks whether a robot can nail wall sheathing to code tolerance. Part of that is how much a missed nail costs. To size it, the programme has been rebuilding a published test: B. D. Weiss's 2017 thesis at Washington State University. She tested 8 by 8 ft OSB shear walls with the bottom foot of nails removed, as rot would remove them. With 6 in edge nailing the decayed walls kept 57% of their strength. With 3 in nailing they kept only 34%.

Six milestones of models could not reproduce the 34% with code-strength fasteners. The best got to about 70%. Weiss loaded her walls back and forth, under the CUREE protocol of ASTM E2126, and every model so far had pushed the wall over once. So this step ran the cyclic test as well.

- **The nail model.** Each nail follows SAWS, the ten-parameter hysteresis behind CASHEW and Weiss's own MCASHEW2 model. It includes pinching and stiffness loss on reloading. The parameters come from Anderson et al. (2007, *Wood and Fiber Science*). They fitted them to cyclic tests of nails through 7/16 in OSB into Douglas fir-larch, the same materials Weiss used.
- **The code check.** Our vectorised SAWS matches OpenSees' implementation to **2×10⁻¹³** of a nail's peak load over a full CUREE history, for five parameter sets. It took two fixes to get there: the published rule descriptions leave out what happens when a nail turns back before reaching the pinching line.
- **The result.** The intact walls peak within **0.1%** of their one-way push. The decayed 3 in wall keeps **70.6%** under cycles against **70.5%** pushed once. Across 96 combinations of end-nail strength, joint slip and anchor-rod slack, the median change is 0.2 point and the largest 3 points.
- **Where cycles do act.** In the decayed 3 in wall the anchor rods yield and their holes crush to 25–28 mm. This happens only after the wall has reached its peak, so the peak does not move.

We registered five predictions in the log before running anything, and four held. The one that failed was a code check. Splitting each nail into two springs, as the model needs for cyclic loading, adds 3–5% to the one-way peak compared with a single radial spring. That is a known bias of the method, and the shares kept agree to 0.2 point.

So within this class of model, cycles are not the answer. Two explanations are left. One is that the 16d end nails holding the studs to the sill are weak: every fit since milestone 18 needs them at about a quarter of their code value. The other is damage SAWS has no term for. Under repeated loading, nails fatigue and tear out of the unsupported bottom edge, and Weiss saw her middle studs split. The next step needs either a tested ultimate for end-nailed stud joints or a nail model whose envelope degrades with cycles. For the robot, the result stands: a missed nail it does not catch costs about 2–3% of a wall.

This is simulation only. The nails in Anderson's tests are 0.113 in, against Weiss's 0.131 in 8d commons, so only shares are compared. The end-nail joint's curve is borrowed from the sheathing nail and swept. Code, numbers and figure: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
