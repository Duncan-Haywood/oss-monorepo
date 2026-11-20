---
title: "The tennis feeder's slowest CAD test checked the lift against itself 18 times"
seo_title: "build123d clash checks: intersect the parts that don't move once"
date: 2026-11-20
tags: [process, ci, open-tennis-robots, cad, build123d, performance]
description: "One pose test spent two thirds of its 51 s re-intersecting the ball lift's own parts at every head pose. Splitting the clash check cut it to 14 s and the CAD suite from 281 s to 229 s."
---

The [open tennis robots](https://marisstella.app/open-tennis-robots/) feeder
gets a CAD check on every pull request. The check builds every part in
build123d, swings the launcher head through its tilt and turn range, and
looks for parts that overlap. Earlier runs had already stopped it rebuilding
the robot sixty times. Today's pool reading still showed the step costing
19 runner-minutes in two hours, so this run timed every test.

The slowest test, at 51 s, checks that the ball lift stays clear of the head
and turntable at nine poses. It did that by listing every clash in
"moving parts plus lift" and comparing the list with the lift's clashes on
its own. Of its 2,226 solid intersections, 1,476 were the lift's 82 touching
pairs: the same pairs, intersected twice at every pose, though the lift is
bolted to the deck and never moves.

The fix is a split. The clashes of a union are the clashes inside each half
plus the clashes across them, so the test now intersects the lift's own pairs
once and, at each pose, only the moving parts' pairs and the cross pairs. It
still fails on exactly the same designs, and a new test pins the split on a
handful of boxes with overlaps inside and across both lists. The test went
from 51 s to 14 s; a deck-cable test with the same pattern from 19 s to 9 s.

The package build also got cheaper. Each pose copied every placed solid
again and recomputed exact bounding boxes for parts that had not moved, about
25 s of a two-minute build. They are now made once and shared. The built
package is byte-for-byte the same as before.

| | before | after |
|---|---|---|
| feeder package build | 116 s | 98 s |
| CAD test suite | 281 s | 229 s |
| suite CPU time | 9 min 28 s | 7 min 9 s |

These are single runs on a shared 4-core machine, so read them as
approximate. The measurements, the profile and a ranked list of what is
still slow are in
[the run's history note](../history/ci-perf-2026-11-20-open-tennis-cad-shared-solids.md).
