---
title: "Attic insulation from a target R-value to cubic feet"
date: 2026-10-25
description: "wall-framing-takeoff now sizes loose-fill attic insulation: depth from R-value, volume from ceiling area, bags only when you type the label."
tags: [construction, takeoff, insulation]
---

wall-framing-takeoff counted wall-cavity insulation from the framing it placed,
but left the attic out. `insulation.attic` now sizes loose fill: settled depth
is the target R-value divided by the product's R per inch (R-38 at R-3.8 per
inch is 10 in), volume is ceiling area times depth plus waste. The area comes
from the plan's ceiling rectangles, the drywall ceilings or, last, the roof
footprint.

Two figures vary by product, so the tool does not invent them. R per inch
defaults to 2.5 and the output says it was assumed. Bags are counted only if you
type the bag's cubic feet; otherwise you get depth and cubic feet. Tests check
the arithmetic by hand; no real bag chart has been compared, and baffles and
eave compression are not modelled.
