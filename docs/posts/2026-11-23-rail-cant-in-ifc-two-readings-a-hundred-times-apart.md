---
title: "Rail cant in IFC 4.3: two readings of one sample, 100 times apart"
seo_title: "IfcSegmentedReferenceCurve cant: reading it, checked"
date: 2026-11-23
tags: [ifc-quantity-takeoff, ventures]
description: "The takeoff now reads rail cant. On buildingSMART's sample it matches the worked text to 1e-17 m. IfcOpenShell's elevation is 100 times the text's."
---

[IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) reads
IFC 4.3 bridges and roads: parts placed by station along an alignment. Rail
models carry one thing more, the cant. On a curve the outer rail is raised,
and everything on the track tilts with it. IFC 4.3 writes that tilt as an
`IfcSegmentedReferenceCurve` over the alignment's gradient curve. Until today
a sleeper placed on one was "not read".

## What the curve says

Each cant segment has a placement. Its location gives a distance along the
track and the height the centreline is raised by. Its axis gives the cross
slope. Between one placement and the next, the segment's parent curve says
how the height and the slope move. buildingSMART's sample model for this
concept comes with a page of worked arithmetic. A 100 m cosine run-out takes
the right rail from 0.16 m to 0 over a railhead distance of 1.5 m. The page
gives D(s) = L/A0 + L/A1 cos(pi s / L), with D(50) = 0.04 m and a slope of
-0.0012567.

The takeoff now follows that text. A cosine parent moves the height and the
slope by its own function, a clothoid gives a linear run-out, and a line holds
them constant. The station's frame is raised by the height and rolled about
the tangent. A 2.6 m sleeper on full cant now has its low end at the left
rail, and its box in the model reflects that.

## The check

At 41 stations along the sample, every 2.5 m:

- the height and its slope match the text's formulas to 1e-17 m;
- the roll matches IfcOpenShell 0.9 to under 0.0001 degree;
- the plan (a cosine transition spiral from 300 to 1000 m radius) ends
  2.4e-9 m from where the file places its next segment. IfcOpenShell's ends
  5e-7 m from it.

IfcOpenShell's height does not match. It starts at 0.08 m, as the file says,
and ends at -7.92 m. The file's end point, and the cant data itself (0 on
both rails), say 0. At every station its change in height is exactly 100.000000
times the text's. That is L, the segment length, applied once too often. Its
roll is right, so it is only the height.

Two readings 7.9 m apart on a 100 m sample show why an independent reader is
worth having. Any one tool can be wrong. Here the file's own numbers settle
it: the cant data and the next placement agree with the text.

## What is left

No public rail model with cant and parts placed on it has turned up yet. The
buildingSMART sample holds the curve alone. The sine and polynomial spirals
are not read. The method and all 41 stations are in
[eval/cant-2026-11-23.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/cant-2026-11-23.md).
