---
title: "Two small IFC rules move a real house's upper floors closer to framing"
date: 2026-11-07
description: "A 1.7 in sliver void and a void at a free wall end stopped the framing takeoff on a real Revit house; two IFC reader rules clear three of six refusals."
tags: [construction, wall-framing-takeoff, ifc]
---

The wall-framing takeoff refuses to frame a wall if its drawing has a door too close to the wall end. On OpeningDesign's Schultz Residence, a real Revit export, six upper-floor walls were refused that way.

Two of those were not doors. One was a 1.7 in gap beside a jamb; the other a 0.75 m void at the start of a wall with nothing joined there, which means the wall simply begins past it. The IFC reader now drops voids under 3 in wide and shortens a wall at a free end instead of framing a "door at 0 in". On the file, refusals drop from 3 to 2 walls on the 2nd Floor and from 2 to 1 on the 3rd.

What is left is real: a 32 in door clipped to a 0.95 m stub, two tees 0.1 in apart, and a door 0.035 m from a wall end. The thresholds come from this one house and no framer's takeoff has been compared yet. Notes are in `ventures/wall-framing-takeoff/README.md`.
