---
title: A wing lift-slope error changes which scaled wing a tail can match
date: 2026-11-07
description: "Cutting the wing's lift slope by 20% in a sub-scale UAV tail search shrinks the matching wings from 6 to 5 and swaps them for different wing-loading factors."
tags: [research, uav, aerolog-scaling]
---

Last step we showed a redesigned tail on a 0.2-scale cargo UAV still restores its longitudinal modes after we cut the tail's lift slope by up to 25%. That was too generous: the same airfoil code also overstates the wing's slope.

This step cuts the wing slope too. With wing and tail both cut 20%, 5 of 17 wings keep a tail within 5% on phugoid, short period and damping (65 tails, from 6 wings and 78 tails). The wings that match change. The k = 1.0 wings, which match with no wing cut, keep 4 to 6 tails at a 10% wing cut and none at 20%. Instead NACA 4412 at k 1.1 to 1.3 and NACA 5406 at k 1.2 and 1.5 match.

So the earlier claim that k = 1.0 wings are the matching ones depends on the wing's lift slope being right. The cut is a uniform stand-in for a Reynolds-dependent error, and the model is a four-state point-mass one. Code and log: `research/aerolog-scaling` (milestone 8g).
