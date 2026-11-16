---
title: "A solar boat's bad learning year: the summer's level, point by point, not its shape"
seo_title: "Solar USV seasonal correction: summer level, not shape"
date: 2026-11-16
tags: [research, marine-hull]
description: "Splitting a solar boat's learned summer into level, tilt and curvature shows the bad year fails where it learned a darker summer, not through its shape."
---

A solar boat plans its battery use from a sun climatology, corrected month by month from a season of its own log. At nine high-latitude points one learning year (2007 for one half of the data, 2012 for the other) ruins that correction. It beats the plain 7-day trailing-mean rule in 1 of 168 test cases; the best year wins 153. Every loss is on distance.

Two earlier steps narrowed it down. Putting the right local-summer months into the bad year fixes most of it ([milestone 6zzl](2026-11-15-marine-hull-solar-boat-cautious-year.md)). Shifting every point's summer up or down together by the small amount that separates the good and bad years does almost nothing ([milestone 6zzn](2026-11-16-marine-hull-solar-boat-summer-shift.md)). That left the summer's shape as the suspect.

This step split each learned summer into three parts: its level (the mean of the three months), its tilt (late summer against early) and its curvature (mid-summer against its edges). Then we swapped the parts one at a time, per point, half-decade and test shape. We wrote nine predictions down first. Two held.

- **The shape is not it.** Giving the bad year the right tilt and curvature recovers 3% of what the full summer repair does (4 cases instead of 1). Tilt alone or curvature alone: 10 each.
- **The level is half of it.** Giving it only the right level, point by point, recovers 54% (49 cases). All three parts together recover 87% (90). The parts interact; they do not add up.
- **Only the too-dark summers matter.** After the run we split the level fix by direction. The bad year learned a brighter summer than the scored years in 219 of 378 cells and a darker one in 159. Fixing only the bright ones: 1 case. Fixing only the dark ones: 49, all of the level's gain. Add the right shape there and you get all 90.
- **The best year shrugs off the bad year's shape.** Given the bad year's tilt and curvature, it still wins 135 of its 153.
- **One shape lever has a direction.** Forcing the best year's summer brighter early and darker late by 0.03 wins 166 cases; the reverse, 148.

Why the uniform shift in 6zzn missed it: the bad year's summer errors run a few percent either way from point to point. A summer that errs bright makes the boat bolder, which costs nothing here. One that errs dark makes it hold back and lose distance. Averaged over the points the errors nearly cancel, so the uniform shift saw no cause. That also means our earlier guess that bad years "learned a brighter summer" pointed the wrong way: it was an average over errors of both signs.

For a designer at high latitude: check a correction learned from one year for summers it learned darker than recent ones, point by point. Erring bright is the cheaper mistake.

Limits: the post-hoc split uses an in-sample comparison a deployed boat cannot make, and the early-bright gain is one forced direction on one year, scored on the cells it came from. Next we'll test a deployable guard, shrinking a learned summer toward the climatology only when it is darker. Same boat, payload, calm-water model and NASA POWER sunlight as before.

Code, results and the full log: [`research/marine-hull`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/marine-hull) (`experiments/run_summer_tilt.py`, `experiments/results_summer_tilt.txt`).
