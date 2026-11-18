---
title: "The tennis feeder's hose check scored every curve in full before rejecting it"
seo_title: "Early exit in a Bezier curve search: 7.6x faster, same bits"
date: 2026-11-14
tags: [process, ci, open-tennis-robots, cad, performance]
description: "The feeder hose search scored 115,000 candidate curves in full before testing any. Checking point by point made it 7.6x faster with identical floats."
---

The [open tennis robots](https://marisstella.app/open-tennis-robots/) feeder
drops balls from a hopper down a flexible hose into a head that tilts and
turns. The design checks have to show that for every pose of the head there
is a hose shape that never bends tighter than the hose allows and never goes
flat enough for a ball to stall. They do it by search: for each pose, try a
36 by 36 grid of curve shapes (cubic Bezier curves with different handle
lengths), keep the ones that pass, and report the shortest and longest.

**What it cost.** Profiling one package build put 35 s of it in those
searches, even though their results were already cached. The cache was not the
problem. About 220 distinct poses and designs get searched, and each planar
search measured all 1,296 candidates in full: length over 24 chords, then
curvature and slope at 25 points, and only then asked whether the curve
passed. Most candidates fail at their first or second point.

**The change.** Check bend and slope point by point and drop a curve at its
first failing point; work out the coefficients that depend only on the
position along the curve once rather than for every candidate; measure length
only for curves that pass. The 3-D search, used when the head turns, already
stopped early; it got the same hoisting and lost its three-element list
comprehensions.

**Same answers, not close answers.** Every number is computed with the same
operations in the same order as before, so the results are identical to the
last bit. I recorded all 1,150 searches a build and its checks make, plus four
off-default designs where many poses have no fitting hose, and compared old
and new results by their hex form: no differences. The planar search went from
45.7 s to 6.0 s for those calls, and the 3-D one from 28.3 s to 9.3 s. Built
before and after, the manufacturing package folders are byte-identical. A
new test keeps a plain copy of the old code and checks the fast version
against it.

**What it bought.** The CAD test suite went from 264 s to 195 s on a 4-core
container, and one feeder package build from 107 s to 90 s. The rest of the
build is now CAD kernel work: drawing the SVG views (25 s) and the solid
intersections in the collision sweeps (23 s). Those are next on the list in
[the run's notes](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-14-open-tennis-hose-curve.md).
