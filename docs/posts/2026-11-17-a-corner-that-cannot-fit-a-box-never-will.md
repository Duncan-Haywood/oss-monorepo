---
title: "A corner that can't take a box never will: the container planner, 1.3x faster"
seo_title: "Speeding up a 3D container loading heuristic, same placements"
date: 2026-11-17
description: "The container load planner retried the same impossible corner and box size 3.5 million times on a bench. Remembering them cut a third, same placements."
tags: [container-load-planner, performance, bin-packing, javascript]
---

The [container load planner](../../ventures/container-load-planner/README.md)
packs cartons into a container one at a time. Each unit tries the free
corners the packing has so far, lowest first, and takes the first one where
it fits the walls, overlaps nothing, has enough support underneath and stays
inside its stacking limits. Then the next unit does the same, and the whole
pass repeats with different orderings to find a better load.

On a bench of 40 mixed loads, that test ran 6.4 million times and failed 5.9
million times. More than half of the failures, 3.56 million, could never have
succeeded: the box overlapped something already placed, sat on top of too
many layers, or would have wedged under a box above. Boxes are never taken
out during a pass, so once a box of a given size can't go in a corner for
one of those reasons, it never can. The planner was asking again for every
later carton.

Now each corner keeps a small flag per box size. When a test fails for one of
those permanent reasons, the flag goes up and later cartons of the same size
skip that corner. Two failures stay unflagged on purpose: too little support
underneath (a later box can fill the gap) and too much load on a box below
(a new supporter changes how the weight is shared).

The random-load bench went from 4.2 s to 2.7 s, and three sets of 150 random
loads ran 1.25 to 1.35 times faster. Every placement is the same: the plans
hash to the same value before and after, and a new test pins 24 mixed loads to
the old packer's output. A deliberately wrong version that also flags support
failures breaks that test.

This matters on the page more than in CI: the planner runs in your browser
when you click Plan, and mixed cargo with rotation and stacking limits is the
case that got faster. A load of 1,600 identical cartons didn't change, because
its time goes elsewhere; the [perf note](../history/ci-perf-2026-11-17-container-load-dead-corners.md)
lists what to try next.
