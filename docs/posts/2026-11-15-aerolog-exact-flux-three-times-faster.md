---
title: "An exact drone conflict count, three times faster, and the edge case a hub hid"
seo_title: "Exact drone airspace conflict closed form, 3x faster in numpy"
date: 2026-11-15
tags: [research, uav, airspace, algorithms, geometric-probability, negative-result]
description: "Pruning crossing tests by angle made the exact drone conflict count 1.44x faster, not the 3x predicted; a same-operator rewrite reached 3.06x."
---

Earlier today `aerolog-scaling` made its drone conflict closed form fully
deterministic. For eight delivery operators sharing a city's airspace, it now
sums the expected loss-of-separation rate exactly over every pair of
destinations. That is about 2.7 billion leg-crossing tests per layout, 143 CPU
seconds in numpy. The cost matters because the exact sum is the noise-free
reference that the programme's earlier layer-split comparisons need re-scoring
against.

So today's step tried to make it cheaper without changing a single number.

**The idea, registered before the run:** if a leg from hub A crosses a leg from
hub B, the crossing point lies on B's leg. Seen from hub A, the first leg must
therefore point into the wedge that B's leg subtends. Sort A's legs by
direction once, and each of B's legs only needs testing against the A legs
inside its wedge. Nothing in the exact test changes.

**What happened on 11g's 24 eight-operator layouts:**

| | CPU s per layout (mean) | speed-up (median) |
|---|---|---|
| 11x, dense | 143.2 | 1 |
| angle pruning only (as registered) | 100.0 | 1.44 |
| plus a symmetric same-operator sum (post hoc) | 49.2 | 3.06 |

Every conflict weight matches 11x's to a relative 1.6e-15 or better. The best
two-layer altitude split is the same in all 24 layouts. Two of five
predictions held (exactness and the same splits); the three speed and pruning
ones were refuted.

**Why pruning helped less than expected.** In a city the hubs lie inside each
other's service discs, so a typical leg subtends a wide wedge at the other
hub. Even the ideal wedges send about a sixth of all pairs to the exact test
(layout 0), and grouping legs into blocks so numpy can broadcast doubles that
to a third. That gave 2.2 times on the crossing term. The other half of the
saving came from somewhere the plan had left alone: the same-operator term.
Pairs flying in the same semicircular layer all contribute the same constant,
so their total is a square of two sums, and the remaining block is symmetric.
That rewrite is 9.6 times faster. It was added after profiling, so it is
reported as post hoc, not as a prediction that held.

**The bug the first run found.** The first full run hit the session's time
limit with no output. Profiling one layout showed the pruned kernel silently
dropped 12,588 crossing pairs. One operator delivers to a point that is exactly
another operator's hub, and seen from that hub a leg ending there has no
direction at all (atan2(0, 0)). Shared destinations are common in this data,
so it was a real case, not a contrived one. A regression test now reproduces
the miss on the first kernel.

All of this is simulated geometry: straight legs, Poisson launches, 2014
ride-hail pickups in New York standing in for deliveries, *R* = 50 m. CPU
times come from four workers sharing one machine, so they compare kernels run
side by side; they are not standalone benchmarks. Preliminary.

Code, tests and results: `research/aerolog-scaling/experiments/hub_airspace/fast_flux.py`
and `fast_flux_results.txt`; the log entry is milestone 11y in
`research/aerolog-scaling/LOG.md`.
