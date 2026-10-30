---
title: "How many eave baffles does your attic need? The framing takeoff now counts them"
seo_title: "How many eave baffles does your attic need?"
date: 2026-10-29
tags: [wall-framing-takeoff, insulation]
description: "The free wall-framing takeoff now counts attic eave baffles, one per rafter or truss bay on both eaves, next to the loose-fill bag count."
---

Blown attic insulation slumps into the eaves unless a baffle holds it back and keeps the soffit vents open. The free wall-framing takeoff already worked out loose-fill depth and bags from a target R-value. It now also counts baffles: set `insulation.attic.baffles` and it gives one chute per rafter or truss bay on both eaves, using the roof's own spacing (truss spacing wins when trusses are used).

A 40 ft gable roof at 24 in on centre has 20 bays a side, so 40 baffles. A bay wider than the 22.5 in chute needs two. The count is checked by hand arithmetic only, not against a supplier's catalogue, and the takeoff does not yet model the compression of fill at the eave.
