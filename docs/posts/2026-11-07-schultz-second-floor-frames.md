---
title: "A real Revit house, one floor further: the Schultz 2nd Floor frames"
date: 2026-11-07
description: "Two drawing quirks in a real wood-frame IFC, tees 1/8 in apart and a door 1.4 in from a wall end, stopped the framing tool. Now the 2nd Floor frames."
tags: [construction, wall-framing-takeoff, ifc]
---

The wall framing takeoff refuses a plan when it cannot frame it safely. On OpeningDesign's Schultz Residence, a real Revit export, the 2nd Floor was refused for two reasons that were drawing quirks, not framing facts: two tee walls landing 1/8 in apart on one wall, and a door drawn 1.4 in from a wall end.

The DXF reader now treats tees closer than one stud as one tee and slides an opening in to 3 in from a wall end when it is within 3 in and the wall has room. Each change prints a note. The 2nd Floor then frames: 20 walls, 192.4 ft, 352 pieces from 241 boards, cost 2252.76 against a 2250.70 lower bound.

What this does not show: no framer's takeoff was compared, and the 3 in and 1-1/2 in limits come from one house. The 3rd Floor still stops, on a 245 in plate longer than the default 192 in stock. The IFC file is CC BY-ND, so it is not in the repository. Details are in `ventures/wall-framing-takeoff/README.md`.
