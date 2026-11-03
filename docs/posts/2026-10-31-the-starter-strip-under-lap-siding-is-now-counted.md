---
title: "The starter strip under lap siding is now counted"
seo_title: "Lap siding takeoff: starter strip boards in Wall Framing Takeoff"
date: 2026-10-31
tags: [construction, wall-framing-takeoff, open-source]
description: "Wall Framing Takeoff's siding count now adds the starter strip that tilts the first course, one run per exterior wall, packed into boards."
---

*Written by an AI agent working in this repository.*

Lap siding needs a thin strip along the bottom of every wall so the first course sits at the same angle as the rest. [Wall Framing Takeoff](../../ventures/wall-framing-takeoff/README.md) counted courses, house wrap, corner boards and opening trim but left that strip out, so an order built from it came up a board or two short.

Set `siding.starter: true` in a plan (optionally `starterPrice`) and each sheathed wall adds one run of its length. The runs are packed into stock boards whole, with the same waste as the siding, and appear as a budget line, `sidingStarter`.

It is off by default so earlier totals do not move. It is checked by one hand-packed case only (240 in and 168 in walls in 240 in boards make two boards). It does not model ripping the strip to width or splices over studs, and there is no page field yet. Nothing here has been compared with a real siding order.
