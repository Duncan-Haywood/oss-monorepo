---
title: "What an HOA wants to see before you build a shed, from your own design"
date: 2026-10-30
tags: [shed-designer, hoa, drawings]
description: "The shed designer now prints an HOA packet: four coloured elevations with every height and the roof pitch, the finishes and their colours, a 3D view and the site plan."
---

A homeowner and a builder walked through the [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) for a real shed this week. They didn't need a building permit, because the shed is under 100 sq ft. They did need their HOA's approval. The HOA asked for what the shed looks like on all sides, with dimensions, and where it goes on the lot, as a PDF.

The plan set could not quite give them that. It had exterior elevations, but they were drafting sheets: grey siding panels, rough openings labelled "R.O.", and no colours. A committee deciding whether a shed matches the house needs to see the siding running the way it will run, in the colour it will be painted, under the roof colour it will have.

**What the packet is.** The Plans tab now has an "HOA packet (PDF)" button. It opens four landscape pages, which you can print or save as a PDF from the browser's own print dialog. The packet needs no PDF library, and nothing is uploaded: the design travels in the page's link.

1. **A summary page.** It gives the footprint and floor area, the roof outline with its overhang, and the heights above the ground to the peak, the eave walls and the floor. It also gives the pitch (4/12 is 18.4 degrees), the siding type, direction and colour, the roofing, the trim, every door and window, colour swatches and a 3D view.
2. **Front and back elevations, then left and right.** Each is drawn to look like the shed. Lap siding runs level at its exposure, T1-11 shows its vertical grooves and board and batten its battens, and the paint, roof and trim colours are the ones you chose. The drawings show corner boards, casings, fascia, the rake, the doors, windows and gable vents. Every elevation carries the wall length, the heights to the wall top and the peak, the floor height and the pitch. Under each wall, a chain of dimensions places every door and window from the corner.
3. **The site plan.** This is the plan set's own site sheet, with the lot, the house and the clearance to each lot line, drawn from what you type. If you have typed no lot, the page is a box to sketch it in.

For the default 8x12, the packet reads 96 sq ft, 10' 2-3/8" to the peak, 8' 4-1/4" to the eave walls, and a 4/12 roof. The front elevation's chain under the wall reads 4' 5", then the 3' 2-1/2" door, then 4' 4-1/2", which adds up to the 12' wall.

**Samples before you design.** `hoa-packet.html#preset=8x12` (and every other preset) shows a sample packet. You can see what you would hand in before you change anything.

**What it is not.** It shows what the design says. It is not engineered or code-checked, and it is not an approval: every page says so. HOAs set their own submission rules, so check what yours asks for. Some want a survey or a contractor's name, which the packet does not have.

The tests (`hoa.test.mjs`) build the packet for every preset. They check that it has all four views, and that each view carries the overall size, both heights, the pitch, and every door, window and vent on its wall. They check that the chain under each wall adds up to the wall, that lap siding draws level and T1-11 upright, and that no page claims an approval.
