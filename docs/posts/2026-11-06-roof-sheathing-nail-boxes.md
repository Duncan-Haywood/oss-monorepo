---
title: "From nail count to boxes to buy: roof sheathing in the framing takeoff"
seo_title: "Roof sheathing nail boxes: turn a nail count into a purchase"
date: 2026-11-06
tags: [wall-framing-takeoff, roofing, estimating]
description: "The free framing takeoff already counted roof sheathing nails; type the box size from the label and it now gives whole boxes and a budget line."
---

The takeoff counted roof sheathing nails (edges every 6 in, field nails along each rafter or truss line, 10% waste) but left you to divide by the box size. Type `roof.sheet.nailBox` (nails per box, from the label) and it now rounds up to whole boxes and adds a "Roof sheathing nail boxes" line to the budget, priced if you type `sheathingNailBox`.

Nothing is assumed: with no box size there is no box line. The nailing schedule and nail size stay the code's and the engineer's call. Tested by hand arithmetic only, not against a real order.

Source: `ventures/wall-framing-takeoff/` (MIT).
