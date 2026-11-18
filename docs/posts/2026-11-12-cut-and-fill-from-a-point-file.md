---
title: "Cut and fill from a surveyor's point file, exactly, in a browser"
date: 2026-11-12
tags: [earthwork-cut-fill, construction, site-work, geometry, new-venture]
description: A free tool turns PNEZD survey shots into a Delaunay TIN and exact cut and fill. Its triangles match Qhull's; one bug was a sliver Bowyer-Watson loses.
---

A small site-work contractor bidding a house pad usually gets a point file from the surveyor: a few hundred lines of point number, northing, easting, elevation and a code. Turning that into "how many yards come off, how many go back, how many trucks" is a job for Civil 3D or Carlson, which most two-truck outfits don't have. So the estimate gets done on a grid on graph paper, or by eye.

[Earthwork cut and fill](https://marisstella.app/earthwork-cut-fill/) is a free page (and CLI) that does the civil-software part. Drop in the point file, set a pad (flat or sloped), or load the proposed-grade points, and optionally draw a boundary. It returns:

- cut and fill volumes between the two surfaces, with the plan areas and the deepest cut and fill;
- the pad elevation that **balances** the site once the cut shrinks as it is compacted into fill;
- what is left over, as bank, loose and truckload quantities;
- a plan-view map of where the cut and fill fall.

Nothing is uploaded; the arithmetic runs in the browser.

## Exact, not sampled

The surface is a Delaunay TIN, the same structure the design packages build. Inside one triangle both the ground and the design are planes, so the depth between them is linear. Each triangle (clipped to the boundary, and to each proposed-grade triangle it overlaps) is split on the line where the depth crosses zero, and each side is integrated in closed form. No grid is laid on top, so the only approximation is the TIN itself.

On a 100 ft lot rising evenly 10 ft west to east, a pad at 105.00 gives 463.0 cu yd of cut and 463.0 of fill, which you can check by hand ([the worked example](https://marisstella.app/earthwork-cut-fill/how-to-calculate-cut-and-fill.html)). Equal cut and fill is not a balance, though. At 20% shrink the cut builds only 370 yd of fill, so the pad still needs 116 bank yards brought in. The balancing pad sits at 104.72 ft, which matches the closed form 100 + a/10, where a = 100√0.8/(1 + √0.8).

## How it was checked

A separate script hands five 800-shot sets, in state-plane-sized coordinates, to SciPy's `Delaunay` (Qhull). The triangle sets are **identical** on all five. Cut and fill agree with an independently derived per-triangle formula to 6 parts in 10¹⁴. The JavaScript suite (30 tests) checks closed-form cases, a grid-method cross-check within 1%, and 40 random sets crowded against the edges.

That last test exists because of a bug. A textbook Bowyer-Watson triangulation starts inside a huge "super-triangle" and deletes it at the end. When a shot sits a hair inside the convex hull, the thin triangle on that stretch of the hull can belong to the super-triangle and disappear with it. On one random set the TIN came out 0.35 sq ft short of the hull (122 triangles expected by Euler's formula, 121 built), and a two-surface volume was off by 0.35 cu ft. The fix walks the outer boundary after triangulating and fills each reflex corner until the boundary is convex. After that the counts match Euler's formula and the triangles match Qhull's.

## What it can't see

A TIN is only as good as its shots. With no breaklines it cuts straight across a ditch or curb nobody shot. It knows nothing about rock, unsuitable soil or the pavement section under finished grade. The next steps are breaklines (constrained Delaunay from coded strings) and daylighting the pad edge at a slope ratio, so the side slopes come out too. The source and tests are in [`ventures/earthwork-cut-fill`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/earthwork-cut-fill), MIT licensed.
