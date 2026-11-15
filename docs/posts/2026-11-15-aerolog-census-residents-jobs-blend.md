---
title: "Mixing census residents and jobs to predict drone conflicts: the level, not the layout"
seo_title: "Census residents vs jobs as a proxy for drone delivery demand"
date: 2026-11-15
tags: [research, uav, airspace, census, calibration]
description: "A mix of about 89% jobs and 11% residents brings census drone conflict estimates to 0.98 of exact out of sample, but no closer per layout than one scale factor."
---

A planner who has to split several drone delivery operators across altitude
layers rarely knows where any operator's parcels go. What they can get is
public census data: where people live (2020 Census) and where they work
(LODES 2022). The last two steps of
[`aerolog-scaling`](../../research/aerolog-scaling/README.md) put those maps
into a paper estimate of conflicts between operators. Jobs alone overshot one
part of the estimate and residents undershot everything. So today's question
was the obvious next one: **what mix of residents and jobs is right, and does
the answer hold for a layout the fit has not seen?**

The setup is the programme's usual one: 24 random eight-operator layouts over
New York, 2014 ride-hail pickups standing in for deliveries, a 50 m separation
radius, 240 flights an hour, and an exact estimator as the reference. Every
operator's demand map is a mixture: a fraction *a* of its jobs map plus
1 &minus; *a* of its residents map, each normalised over its service disc. The
conflict terms are linear in each operator's map, so four map combinations per
layout give every mix exactly, in 1.3 s. Each layout's figure comes from a
mix fitted on the other 23.

**What held (6 of 10 pre-registered predictions):**

| | before (11v) | fitted mix, out of sample | one scale factor, out of sample |
|---|---|---|---|
| take-off term, pooled level vs exact | 0.83 | 0.98 | 1.01 |
| take-off term, median log error per layout | 0.20 | 0.13 | 0.13 |
| take-off term, layouts within 5% | 5 of 24 | 3 of 24 | 8 of 24 |
| crossing term, pooled level vs exact | 0.92 | 0.98 | 1.00 |
| crossing term, median log error per layout | 0.068 | 0.093 | 0.096 |

- The best mix is about **89% jobs, 11% residents**, and it is stable: held
  out one layout at a time it ranges only from 0.88 to 0.91 (0.80 to 0.87 for
  the crossing term).
- It fixes the census estimate's **level**: the take-off term goes from 0.83
  to 0.98 of exact, the crossing term from 0.92 to 0.98.
- It does **not** fix the per-layout error. A single scale factor on the plain
  residents-plus-jobs sum does as well (median log error 0.129 against
  0.128), and gets more layouts within 5%. Fitting separate mixes for flight
  paths and for delivery points does not help either.
- On the crossing term, fitting the level makes the *typical* layout worse
  (median log error 0.068 to 0.093). The census errors are skewed: a few
  layouts are 22% to 30% low, and pulling the average up overshoots the rest.
- Layer-split decisions barely move: a mean 2.56% worse than the split the
  closed form picks from real destination lists, against 2.68%. The mix fixes one bad split (layout 3,
  17% to 0.2%), loses the take-off term's earlier fix (layout 5), and makes
  two small new misses.

**What this means for a planner.** Census maps can be calibrated to the right
overall conflict level with one number per term, and that number barely
changes from one layout to the next. Past that, mixing residents and jobs buys
nothing. What is left is specific to each layout: where *these* operators'
deliveries actually go. Earlier steps in the programme (11m to 11o) found the
same for the crossing term, and found that asking one operator for its real
destinations fixes most bad splits. The next step is a richer demand model
(land use, floor area, or LODES origin-destination flows), checked the same
out-of-sample way.

The mix was fitted against pickups in the same city that define the layouts,
so a planner elsewhere would have to bring *a* from another dataset. The model
has straight legs, Poisson launches, no avoidance and no wind. Census counts
show where people live and work, not where parcels go. These results are
preliminary. Code, tests and results:
[`research/aerolog-scaling`](../../research/aerolog-scaling/README.md),
milestone 11w.
