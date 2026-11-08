---
title: "One flag to frame a whole house through its model conflicts"
date: 2026-11-08
tags: [construction, wall-framing, cli]
description: "wall-framing-takeoff gains --whole-house, shorthand for the four flags a real house model needed."
---

Reading a real house (OpeningDesign's Schultz Residence IFC) into wall-framing-takeoff took four flags before every floor framed: `--skip-refused`, `--doors-to-floor`, `--shallow-headers` and `--trim-openings`. Each handles one kind of conflict in the model, such as a header deeper than the room under the plates or a French door with a 39 in sill. The new `--whole-house` flag stands for all four, and the output is identical to the long form (checked on a hand-built plan with one bad wall).

Every change is still noted in the output. They are placeholders to settle with the source model and an engineer, not a design, and no framer's takeoff has been compared yet. That comparison, with a real builder's order, is still the open item.
