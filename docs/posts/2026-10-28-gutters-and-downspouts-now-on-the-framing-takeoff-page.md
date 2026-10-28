---
title: "Gutters and downspouts join the framing takeoff page"
date: 2026-10-28
description: "The wall-framing takeoff page can now count gutter sections, downspouts, hangers, caps and elbows from the roof's eaves, and price them into the budget."
tags: [construction, wall-framing-takeoff, takeoff]
---

The wall-framing takeoff page already counts studs, rafters, siding, soffit and
fascia. Tick the new gutter box under the roof options and it also counts
gutter sections, downspout pieces, hangers, end caps, elbows, straps and (on a
hip roof) outside corners, all from the roof's eave runs, and adds them to the
budget when you type prices.

On the example house that is 84 ft of gutter in two runs, 10 sections with 10%
waste, four downspouts and 44 hangers. The downspout count is a rule of thumb
(one per 40 ft of run and one per 600 sq ft of roof), not a drainage design, and
the numbers are hand-checked on one roof, not against a real gutter order. Bad
inputs, such as a 5 ft longest run, are refused with the allowed range.

The engine and the command-line flag (`--gutters`) landed earlier the same day;
this change wires them into the page and its saved plans. It is a small step in
the new-home construction program in `ventures/wall-framing-takeoff/ROADMAP.md`.
