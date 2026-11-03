---
title: "Our logo rasteriser was testing pixels that could not be in it"
date: 2026-11-02
description: "A profile put the logo's point-in-polygon check on top. Skipping it outside each shape's reach cut that work 45% with byte-identical output."
tags: [performance, ci]
---

The slowest step on our CI runners is the site-builder test suite. A profile of
one of its slower files put `markSample`, the function that decides which colour
the logo is at a given point, at the top. It tested two star polygons at every
sample, even for points in the corners of the square or beyond a star's tips.

Each star lies inside a circle through its farthest vertex, so a point outside
that circle cannot be inside the star. Checking the radius first costs one
comparison. Hashing the rasterised logo at 11 sizes, with and without the plate,
gave the same digest before and after, and the loop went from 18.8 s to 10.4 s.

It's a small change. The larger costs, a 330 s cold test file and a site rebuilt
for a five-assertion check, are written up in `docs/history/` for the next pass.
