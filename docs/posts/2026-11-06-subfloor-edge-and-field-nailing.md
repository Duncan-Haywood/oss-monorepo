---
title: "Edge and field nailing: counting subfloor fasteners the way the schedule reads"
seo_title: "Subfloor nailing schedule calculator: edge and field fastener counts"
date: 2026-11-06
tags: [wall-framing-takeoff, floor, construction]
description: "The open-source wall framing takeoff can now split subfloor fasteners into edge and field spacing instead of one flat spacing."
---

A flat 8 in spacing was a placeholder. Nailing schedules for subfloor sheets usually name two numbers: a tighter spacing on the supported edges and a wider one in the field.

The wall framing takeoff now takes `fastenerEdgeSpacing` and `fastenerFieldSpacing` (defaults 6 and 12 in). It walks each sheet piece in the layout: both ends, which sit on joists, and the front and back rim edges count at the edge spacing, and every joist line strictly inside the piece counts at the field spacing. Long edges between courses run across the joists, so they are left out; those are blocked or tongue-and-groove.

A test builds a 20 x 8 ft floor, counts the ends and the interior joist lines independently, and checks the total, with and without a rim. The spacings are inputs; the engineer's real schedule and the fastener type are not checked, and no real order has been compared.
