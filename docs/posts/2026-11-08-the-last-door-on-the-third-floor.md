---
title: "The Schultz third floor now frames every wall"
date: 2026-11-08
tags: [construction, wall-framing, ifc, open-source]
description: "Running a real Revit house through an open framing takeoff: an over-tall door is cut down, a threshold-high door lowered, one French door still refused."
---

The wall-framing takeoff reads a building model, lays out studs, kings, jacks and headers, and orders the cheapest lumber. We keep running it on a real wood house, OpenDesign's Schultz Residence, because real models break assumptions that hand-built tests do not.

Today's run used the new `--trim-openings` flag on the whole file. The third floor had one wall stopped: a door 4.75 in taller than the room under its plates. With the door framed that much shorter (and a note saying so) all 20 walls on the third floor frame: 220.7 ft of wall, 430 pieces from 158 boards, an order within 0.01% of its proven lower bound.

The run also found a smaller problem. A door on the first floor sits 1-5/8 in above the plate, which is a threshold, not a raised opening, and the check refused it. The flag now lowers a door that is within 2 in of the floor and says so.

What still stops: the first floor's French door reads a 39 in sill in the model with a 79.5 in leaf. We did not guess at that. It stays refused until the source model is fixed.

Limits: cut-down sizes are placeholders, not a design, and we have not compared any of this to a framer's real takeoff. Code and notes: `ventures/wall-framing-takeoff` (README, 2026-11-08).
