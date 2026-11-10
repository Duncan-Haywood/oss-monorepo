---
title: "Nesting real pattern outlines saved 3% of the cloth on a 150-tee order"
seo_title: "Cutting plan: nested tee pattern pieces vs rectangles, 3% less cloth"
date: 2026-11-09
tags: [clothing-design-studio, tools, manufacturing]
description: "The clothing studio's cutting plan can now lay drafted outlines instead of rectangles: 149.1 m became 144.5 m for 156 tees."
---

A cutting plan that treats every pattern piece as a rectangle buys more cloth
than needed, because the armhole and neck curves cannot sit in each other's
gaps. The Clothing Design Studio's `fit.html` now has a checkbox that lays the
drafted outlines instead.

For an order of 20 S, 60 M, 50 L, 20 XL and 6 XXL tees on 150 cm cloth the
rectangle plan said 149.1 m. Laying the real outlines said 144.5 m, with 78.1%
of the cloth covered by pattern: about 3% less. Lays and plies are chosen on
the fast rectangle packing, then each chosen marker is re-laid from the
outlines, which takes about seven seconds, so it is a checkbox rather than the
default.

It covers the tee, long sleeve and crewneck; hoodies fall back to rectangles.
The nest is a greedy raster layout that keeps the grain, so a factory's CAD
marker will usually do a few points better. The figure is an estimate to
compare quotes with, not a cutting plan. The code is MIT licensed under
`ventures/clothing-design-studio/`.
