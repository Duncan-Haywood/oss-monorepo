---
title: "Slack in the anchor rod's hole does not explain a decayed shear wall"
date: 2026-11-14
tags: [buildbot-sheathing, shear-wall, wood-frame, structural-engineering, simulation]
seo_title: "Shear wall missing bottom nails: does anchor rod slack explain it?"
description: "A pushover of Weiss's decayed shear wall rules out anchor-rod slack and early-peaking stud joints; every fit needs end nails at a quarter of code strength."
---

In 2017 Weiss tested 8 by 8 ft wood shear walls at Washington State University. To simulate decay at the base, she left out every nail below 12 inches. Walls nailed at 6 in on the edges kept 57% of their strength. Walls nailed at 3 in kept only 34%. The `buildbot-sheathing` programme needs to know why. A robot that misses nails low on a sheet needs to know which misses matter.

Our last two steps were rigid-plastic limit analyses, where every fastener carries its full strength at once. With code-strength stud joints, both models said the decayed 3 in wall should keep 64–80%. They only got near 34% when the 16d nails joining the studs to the sill were made much weaker than the code's design ratio. Milestone 18 left two physical explanations a rigid-plastic model can't represent:

- **Slack.** The hold-down's anchor rod sits in an oversized hole, so the end studs can slide before the rod bears.
- **Peak order.** The stiff stud joints may peak, and soften, before the sheathing nails reach their peak.

So today's step builds the same wall as a displacement model and pushes it over to 150 mm. Each sheathing nail follows a tested load-slip curve: 8d nails through 7/16 in OSB, from Shameli Derakshan, Zhou and Ni (2019). The stud joints soften too. Each anchor rod carries nothing until a gap closes. After that it has the NDS dowel stiffness, about 47 kN/mm, up to its design value.

- **The model checks out.** With elastic-perfectly-plastic springs it reaches the limit analysis's capacity within 0.044% in all 16 cases. Softening alone moves the decayed walls by under a point.
- **Slack doesn't matter.** A 1/16 in gap, a standard oversize hole, moves the decayed walls by **0.1 point**. Even 1/4 in only matters when the stud joints peak early. In that case the 3 in wall still keeps 52–63%.
- **Neither does peak order.** If the joints peak at a quarter of the nails' slip, the decayed 3 in wall still keeps **71%** at code strength.
- **Every fit has weak end nails.** We ran 960 pushovers. At 0.75 of the code ratio or above, no joint strength came within 10 points of both tested groups. All 30 fits within 5 points have the end nails at **a quarter** of the NDS ratio. The best keeps 57.8% and 32.5%, against 56.5% and 33.9% tested.

We registered six predictions in the log before running anything. Three held: the limit check, softening alone and slack. Three were refuted: the comparison with milestone 16's single sheet, early-peaking joints and a near-code fit. The milestone 16 comparison was refuted by a modelling convention, not a bug. A rigid stud pinned on its centre line also moves the edge nails, which sit 3/8 in off that line, slightly up or down. That makes it about 1.3% stiffer than milestone 16's parallelogram. With the pins on the nail lines, the two models agree to seven digits.

The result narrows the question. Either 16d end-nailed stud-to-plate joints really carry about a quarter of their design ratio in these walls, or the 34% comes from what a monotonic push leaves out. That means cyclic tear-out at the unsupported bottom edge, or the middle stud splitting, both of which Weiss reports. A tested ultimate and load-slip curve for end-nailed joints would decide the first. A cyclic push would test the second. None of this changes the robot's numbers: an escaped miss still costs 2–3% of a wall on average.

Limits: the push is monotonic, while Weiss's tests were cyclic. The end-nail joint's curve borrows the sheathing nail's shape, with its strength and slip scale swept rather than measured. Studs and sheets are rigid. Code, numbers and figure: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
