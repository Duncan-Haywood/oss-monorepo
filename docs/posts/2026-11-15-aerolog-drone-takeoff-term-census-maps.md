---
title: "The drone take-off conflict term from census maps: 0.83 of exact, and one bad split fixed"
seo_title: "Drone take-off conflicts from census data: residents plus jobs"
date: 2026-11-15
tags: [research, uav, airspace, census, geometric-probability]
description: "From census residents and jobs alone, the drone take-off conflict term comes to 0.83 of exact, the paper estimate to 0.94, and one wrong layer split is fixed."
---

Yesterday `aerolog-scaling` turned the take-off conflict term into a lookup
on a 100 m grid. This term counts conflicts that start inside the separation
disc, when a delivery drone launches from its hub, or turns for home at a
customer, right next to another operator's drone. With each operator's real
destination list the grid term was within 0.7% of the exact one. With no
demand map at all (deliveries spread evenly over each service disc) it was
only 0.44 of exact.

A planner who sizes altitude layers for several drone operators usually has
no one's destination list. What they do have is public census data. So today's
step puts the same grid term on the census maps an earlier step built for New
York: 2020 Census residents, LODES 2022 jobs, and the two added together.

**On the same 24 eight-operator layouts** (2014 pickup points standing in for
deliveries, *R* = 50 m, 240 flights an hour), seven of eight pre-registered
predictions held:

| destinations from | take-off term / exact |
|---|---|
| each operator's real list (yesterday) | 0.99 |
| jobs | 1.06 |
| residents plus jobs | 0.83 |
| residents | 0.63 |
| uniform discs (yesterday) | 0.44 |

- Residents plus jobs rank operator pairs almost as the exact term does
  (median r 0.988). The term costs 0.67 s per layout.
- Added to the census flux weight, it moves the paper estimate of en-route
  conflicts from 0.88 to 0.94 of the exact estimator. Of the gap left against
  the destination-list version, about 1.3 points come from the take-off
  term and about 5.4 from the census flux term.
- Unlike on the real lists, here the term **changes a decision**. In layout 5
  the census split went from 9% worse than the best paper-free split to
  within 0.04% of it, and no other residents-plus-jobs split moved. On jobs
  alone it fixed three splits and hurt none. On residents alone it made one
  worse.
- The refuted prediction: a layout whose census map gets the crossing
  traffic wrong does not get the take-off term wrong by the same factor
  (r 0.42 across layouts). One per-layout correction factor would not fix
  both.

**What this means for a planner.** It is worth adding the take-off term to
census-based paper weights. But it fixes only one of gas_pj's eight misses
above 2%. The rest come from the demand map's crossing traffic, as earlier
steps found. Next: a residents/jobs blend fitted for the take-off term (jobs
overshoot deliveries, residents undershoot), checked out of sample, and a
fresh simulation of layout 5 to confirm the fix outside the exact
estimator.

The model has straight legs, Poisson launches, no avoidance and no wind, in
one city at one grid and one radius. The census counts measure where people
live and work, not where parcels go. Preliminary. Code, tests and results:
[`research/aerolog-scaling`](../../research/aerolog-scaling/README.md),
milestone 11v.
