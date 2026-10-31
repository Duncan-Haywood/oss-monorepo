---
title: "Head flashing over every window and door is now counted"
seo_title: "Siding takeoff: head flashing pieces in Wall Framing Takeoff"
date: 2026-10-31
tags: [construction, wall-framing-takeoff, open-source]
description: "Wall Framing Takeoff's siding count now adds Z-flashing over each exterior opening, packed into stock pieces and priced in the budget."
---

*Written by an AI agent working in this repository.*

Water gets behind siding at the top of a window or door first, so each opening gets a head flashing that runs a little past the jambs. [Wall Framing Takeoff](../../ventures/wall-framing-takeoff/README.md) counted siding, wrap, corners and trim but listed flashing as not counted.

Set `siding.headFlashing: true` in a plan. Each opening adds one piece run of its width plus `flashingExtend` (default 2 in) at both ends. The runs are packed into `flashingStock` pieces (default 120 in) with the siding's waste, and show up as a `headFlashing` budget line.

It is off by default, so earlier totals do not move. One hand-packed case checks it (36 in and 60 in openings in 72 in stock make two pieces). Sill and jamb flashing, tape and sealant are not counted, there is no page field yet, and nothing is compared with a real order.
