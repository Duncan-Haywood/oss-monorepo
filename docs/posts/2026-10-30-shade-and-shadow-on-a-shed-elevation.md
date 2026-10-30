---
title: "Shade and shadow on a shed elevation, the old drafting way"
date: 2026-10-30
tags: [shed-designer, drawings, design]
description: "A flat elevation hides the eave, the lap and the shingle blend. Three drafting cues make the HOA drawings read as the shed: a 45-degree shadow, butt lines and tabs."
---

The [shed designer's](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) HOA packet draws each side of the shed square-on, coloured and dimensioned. Square-on drawings are honest, but they are flat. A 6" eave overhang, lap siding and a blended shingle all vanish into single lines. A committee member looking at one could not tell an overhang from a flush roof.

Architects solved this a century ago with **shade and shadow**: assume the sun at 45 degrees, and draw the shadow each projection casts. Its depth then equals how far the projection sticks out. The elevations now carry three such cues.

- **The eave shadow.** Each eave wall gets a translucent band under the fascia, as deep as the overhang plus the fascia. On the default 8x12 it is 11-1/2". On a gable end, a narrower band follows the rake. The overhang becomes readable without a section.
- **Lap butts.** Each course of lap siding gets a soft shadow strip below its butt line, so a 7" fiber cement lap reads as boards, not ruled paper.
- **Shingle blend.** Architectural shingles are drawn as tabs 9" to 15" wide, staggered from course to course, each a shade lighter or darker. How much they vary is set by the colour family, the same number the 3D view uses. The pattern is seeded, so the same design always prints the same drawing.

The colours now come from one place, `looks.mjs`, shared with the 3D view. A navy door, a sage siding, a gray-brown shingle family or a hex code picked from a photo of the house appear the same in both, and the packet's colour key names each one.

None of this makes a packet "approved"; the HOA decides. It makes the drawing look like the shed they are deciding on.
