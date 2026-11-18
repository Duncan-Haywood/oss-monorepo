---
title: "How much air-hose drag can a nailing humanoid take? At a 1.2 m grip, about 4 N"
date: 2026-11-18
tags: [buildbot-sheathing, construction-robotics, humanoid, contact-forces, negative-result]
seo_title: "How much hose drag can a nailing humanoid take?"
description: "No forward lean keeps a humanoid nailing high on a wall balanced under 20 N of air-hose drag. At a 1.2 m grip it tolerates about 4 N pulling back."
---

The [`buildbot-sheathing`](../../research/buildbot-sheathing/) programme asks whether a stock humanoid can hold a nail gun against a wall and land every nail on the studs. The [last milestone](2026-11-18-humanoid-tips-back-under-hose-drag.md) found why 8 of 34 poses had no plan: with an air hose pulling backward at 20 N and the gun pressing at 50 N, the robot tips back. The obvious fix is to lean it further into the wall. Milestone 50 ([`experiments/m50_relean/`](../../research/buildbot-sheathing/experiments/m50_relean/)) tested that, with its hypotheses registered first.

**No lean works.** We swept the forward lean of the Unitree G1 and H1 models from 0 to 150 mm in 5 mm steps, then refined the best one. At each lean we checked whether the feet can balance a 25 N and a 50 N press under 17 hose loads (none, then 5 and 20 N in 8 directions), with friction μ 0.5. At every one of the 8 poses the answer stays no. The best margin is −0.69 N for the G1 at 1.0 m grips and −10.1 N at 1.2 m. Leaning forward buys headroom against a hose pulling back. Past a point, a hose pulling *towards* the wall at the light 25 N press tips the robot forward instead. One lean cannot cover both.

**So we measured the limit instead.** For every pose and direction we bisected the largest hose tension the stance can carry:

| Robot, grip height | Straight back, current lean | Any direction, best lean |
|---|---|---|
| G1, 1.2 m | 4.0 to 4.2 N | 11.4 to 13.4 N |
| G1, 1.0 m | 12.9 to 17.0 N | 14.9 to 19.5 N |
| H1, 1.6 m | 12.0 N | 17.0 N |

Every pose that did have a plan tolerates at least 20.1 N in every direction, so the earlier 20 N sweep sat just inside them. The straight-back limit follows a simple rule: the press headroom above 50 N divided by 0.78. The rule was registered from the last milestone's slope, and it held to within 9% at all 8 poses.

**In hose terms.** A hose dragged across the floor pulls with up to the floor's friction times its weight on the floor. For a 3/8 in rubber air hose at μ_f 0.5, the G1's 1.2 m limit comes with about 3 m of hose dragging. That floor friction is a swept guess, not a measurement. At high grips the hose has to be fed or carried by a reel or a boom, not dragged behind the robot.

Two hypotheses were refuted (a lean for the firing range, and one that also stands at zero press). One held (the linear rule). One was never tested, because it needed a working lean. The first run also had a bug: it read an infeasible balance check as feasible. That was caught and fixed before any result was used, and the [log](../../research/buildbot-sheathing/LOG.md) records it. This is a statics model; the soles' friction on OSB has not been measured.
