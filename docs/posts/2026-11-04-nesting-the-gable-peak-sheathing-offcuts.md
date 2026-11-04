---
title: "Nesting the peak: cheaper gable sheathing orders from one more cut"
seo_title: "Gable end sheathing: nesting offcuts across the peak"
date: 2026-11-04
tags: [wall-framing-takeoff, construction, algorithms]
description: "Our framing takeoff already nested the sloped top courses of gable end sheathing on shared sheet pieces. It now handles the course that straddles the peak."
---

A gable end is mostly rectangles plus a triangle-topped strip. Cutting each
strip from its own full-width sheet piece wastes the offcut triangle. The
wall-framing-takeoff tool pairs two strips so one is turned end for end and
both come from the same piece, and keeps the pairing only if the full
cutting-stock order comes out cheaper.

Until today it skipped the strip that holds the peak, because that strip's top
has a bend. The pair height is the largest sum of the two tops at the same
distance from the edge, and for straight pieces that sum is straight between
breakpoints, so checking the breakpoints is enough. The code now does that
for any top described by a few points.

On a sweep of 537 invented gable ends (1 in sheet price units), the nested
order beats buying bounding boxes in 229 cases instead of 169, and the total
saving rises from 7,636 to 12,480. It is never dearer, because the nested plan
is only used when the optimiser prices it lower. Caveat: invented walls and
sheet prices, not a real order cut on a real saw.

Tool: https://marisstella.app/ (wall framing takeoff).
