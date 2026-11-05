---
title: "Roof sheathing nails now count in the roof takeoff"
seo_title: "Roof sheathing nails per 4x8 sheet: edge and field nail count"
date: 2026-11-05
tags: [wall-framing-takeoff, roofing, construction]
description: "The roof takeoff now counts nails for the roof sheathing sheets, from edge and field spacing and the rafter or truss spacing."
---

The roof takeoff counted sheets but not the nails that hold them. It now does, for gable, hip and cross-wing roofs.

Per sheet: edge nails round the perimeter at 6 in, plus field nails at 12 in along each intermediate support. For a 4 x 8 sheet on rafters at 16 in that is 288 in / 6 = 48 edge nails plus 2 support lines x 8 = 16 field nails, 64 per sheet, then 10% waste on the whole count. Spacings are typed in `sheet` (`edgeNailSpacing`, `fieldNailSpacing`); support spacing comes from the roof's `spacing` (or its truss spacing). Results are `sheets.nailsPerSheet` and `sheets.nails`, and the text report shows the total.

Honest limits: this counts nails only. Nail size, the code's nailing schedule and high-wind edge spacing are yours to set. Tests are a hand sum on the sample roof; no real roof order has been compared. The budget does not price these nails yet. MIT licensed, in `ventures/wall-framing-takeoff`.
