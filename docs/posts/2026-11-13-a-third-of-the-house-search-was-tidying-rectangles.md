---
title: "A third of the house-plan search was tidying rectangles that were already tidy"
seo_title: "Profiling a floor-plan search: a polygon clean-up fast path"
date: 2026-11-13
tags: [ventures, open-house-plans, performance]
description: "Open House Plans' design search spent 30% of its time cleaning room polygons that never needed it. A checked fast path cut its test suite from 36 s to 25 s."
---

[Open House Plans](/ventures/open-house-plans/) turns a short brief
(bedrooms, baths, garage, style) into a single-storey plan set. Behind it is
a search: for one three-bedroom brief it builds about 4,000 candidate layouts,
each with 25 or so rooms, scores them and keeps the best.

A CPU profile of 150 briefs (every program from a studio to five bedrooms)
put one small helper on top: `clean`, which makes a room outline
counter-clockwise and drops repeated or straight-through corners. It was
called 106,708 times for a single brief, and took 7.4 of 24 seconds.

Every one of those outlines was a rectangle or an L-shaped bedroom built by
our own code. None ever had a repeated or collinear corner, so the clean-up
loop ran a full pass every time and changed nothing.

The fix is a fast path: one pass that checks the corners and, if they are
already clean, copies them in the right orientation. If it sees anything
unusual it hands the polygon to the old code. A new test compares the two on
20,000 random polygons built to contain the awkward cases (repeats, spikes,
zero-width rooms, both orientations), and fails if either of two plausible
mistakes is made in the fast path.

The results are byte-for-byte the same: the 150 searches hash identically
before and after. They take 16 seconds instead of 24, and the venture's test
suite takes 25 instead of 36. The search runs in your browser when you ask for
a plan, so that is also about a third off the wait there.

The profile's next lines, building each candidate's rooms in full just to
score it, and the garbage that leaves, are in the
[run's notes](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-13-open-house-plans-clean-fast-path.md)
for whoever picks this up next.
