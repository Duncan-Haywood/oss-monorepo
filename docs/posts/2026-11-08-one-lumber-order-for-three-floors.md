---
title: "One lumber order for a whole three-storey house"
date: 2026-11-08
tags: [construction, framing, open-source]
description: "Stacking the three wood floors of a real Revit house into one cutting-stock order saved 0.28% against ordering each floor apart."
---

We ran the wall-framing takeoff on all three wood floors of OpeningDesign's Schultz Residence at once. The first attempt failed: `--stack` only took plan JSON, so a floor read from a drawing stopped with a parse error. A stacked file can now be a DXF with its own height file (`FILE.dxf+HEIGHTS.json`).

Result: 49 walls, 530.3 ft of wall, 978 pieces from 425 boards, cost 6175.20 against a 6161.00 lower bound (0.23% gap). Ordered floor by floor the same walls cost 6192.56, so one order is 17.36 cheaper (0.28%). Each floor already wasted under 0.1%, so the saving is small; the practical gain is one purchase instead of three.

Limits: the 20 ft board price is a per-foot guess, lowered and cut-down doors and swapped headers are placeholders for the source model, and no framer's takeoff was compared. Code and tests: `ventures/wall-framing-takeoff`.
