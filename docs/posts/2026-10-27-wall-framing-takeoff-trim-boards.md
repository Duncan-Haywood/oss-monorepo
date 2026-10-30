---
title: "Wall framing takeoff now orders baseboard and casing"
date: 2026-10-27
description: "A new --trim count packs baseboard and door and window casing pieces into stock boards and feeds the budget."
tags: [wall-framing-takeoff, construction, interior]
---

The interior list stopped at drywall and insulation. [wall-framing-takeoff](../../ventures/wall-framing-takeoff/) now has `--trim`: baseboard along each wall less the door widths (one face on exterior walls, two on interior ones), and casing for every opening face, two legs and a head for a door plus a sill piece for a window. Pieces are packed first-fit-decreasing into the stock length you type, so a 56 in run and a 36 in run share a board instead of each costing one.

Boards flow into `--budget` when you give `baseboard` and `casing` prices. The reveal, casing width, stock lengths and waste are typed defaults, mitres and scarf joints are not modelled, and the count is checked against hand arithmetic only, not a real trim order. There is no page control yet; that is next.
