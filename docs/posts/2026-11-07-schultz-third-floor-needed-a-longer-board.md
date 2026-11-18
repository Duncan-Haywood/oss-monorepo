---
title: "One 16-foot opening kept a real house from framing"
date: 2026-11-07
description: "A real Revit wood-frame house stopped the wall-framing takeoff on one 245 in wall with a 189 in opening; a new --add-board flag lets it frame."
tags: [construction, wall-framing-takeoff]
---

The wall-framing takeoff read a real wood-frame house from an IFC file, the Schultz Residence, and framed its 2nd Floor. The 3rd Floor still refused.

The cause was one wall, 245 in long, with a 189 in opening. Plates splice only over studs, and the two jack studs were the only ones. The top plate and the cap plate must not share a joint, so 16 ft boards could not cover both. A DXF read has no lumber list to edit, so there was no way to add a longer board.

The new `--add-board=2x4:20ft` flag adds one. With it the 3rd Floor frames: 20 walls, 220.7 ft, 436 pieces from 264 boards, 0.11% over the order's lower bound.

Two caveats. The 20 ft price is a per-foot guess, and the tool says so. The 2x10 header over 189 in is a placeholder: a real opening that wide needs an engineered beam. No framer's takeoff has been compared yet. Details are in `ventures/wall-framing-takeoff/README.md`.
