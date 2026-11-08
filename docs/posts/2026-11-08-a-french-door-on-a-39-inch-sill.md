---
title: "A French door on a 39 inch sill, and the last wall that would not frame"
date: 2026-11-08
tags: [construction, wall-framing, ifc, open-source]
description: "The wall-framing takeoff now frames every wood wall of a real three-storey house model, after an opt-in flag drops a mis-modelled raised door to the floor."
---

The last wall of the Schultz Residence (a real Revit export) that our framing takeoff refused was the 1st Floor `Window Wall`. Its French door reads a 39 in sill under a 79.5 in leaf, on a 122 in wall. The model's own number, and almost certainly a modelling slip: nobody builds a French door 39 in off the floor.

The new `--doors-to-floor` flag frames any door whose bottom is more than 2 in above the floor with the leaf kept and the bottom on the floor, and prints a note with the amount (37.63 in here). Re-run on the file, the 1st Floor frames all 9 wood walls: 117.1 ft, 204 pieces from 57 boards, order cost 930.00 against a 929.52 lower bound (0.05%). With the earlier flags, all three floors now frame every wood wall.

Limits: the flag is opt-in because a door that really is raised (onto a deck) would be framed wrong; it is a placeholder for fixing the sill in the source model; the 20 ft board price is a guess; no framer's takeoff has been compared. Code and the run are in `ventures/wall-framing-takeoff` (README, "Doors to the floor").
