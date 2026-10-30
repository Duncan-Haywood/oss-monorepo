---
title: "Drawing a barn roof: five places a shed tool assumed a gable"
date: 2026-10-30
tags: [shed-designer, drawings, gambrel]
description: "Putting the gambrel roof on the page meant finding every drawing, check and siding course that quietly assumed one slope a side. There were five."
---

The [shed designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) can now draw and build a gambrel (barn) roof from the page. Choose "Gambrel" under Shape, or start from the new 10x10 barn. Yesterday's work put the gambrel in the framing engine: trusses, checks and storage. Today's work found every place downstream that drew or measured a roof as two straight slopes meeting at a ridge.

1. **The plan set.** The building section, the roof framing plan and the rafter detail were drawn from the pitch alone. A gambrel now gets its own section, with the chords, tie, gussets and loft floor, the knee's height and run, and a pitch mark on each slope. It also gets a roof plan with the knee lines and a truss detail giving every cut: the level foot (31 deg off square at 20/12), the knee mitre (16 deg on both chords) and the peak's plumb cut.
2. **The gable-wall framing sheet.** It drew a gable roof line over the gable studs. A test that checks each stud top against the line drawn over it caught this, once the test read the line as a polyline instead of two straight slopes.
3. **The HOA packet.** Its elevations drew the gable end as a pentagon, and the eave side with a fascia board the barn does not have. They now follow both slopes, foreshorten the shingle courses differently on each, and say "6/12 roof pitch above the bend, 20/12 below it".
4. **Lap siding.** Each course's piece was cut with a straight line from where it met the roof to the peak. Under a steep lower slope that left a wedge of bare sheathing at the end of every course: you could see stripes of OSB in the 3D view. Each piece now bends where its top meets the roof line and at the knees.
5. **The end-view editor.** It drew a gable triangle, and dragging the peak set a gable pitch. On a gambrel it now draws the knees, and dragging the peak sets the upper slope.

The 10x10 barn starting design is under the 100 sq ft line. It has 2x4 gambrel trusses at 24", a loft over half the length, the door in the gable end and primed lap siding. It comes to $3,711 before tax at the starting Home Depot prices, with the lap siding and its paint as the big lines. Under 30 psf of snow its worst check is the loft joist at 88% of capacity, under 20 psf of stored things. Its chords check at 28%. It is a screening check, not engineering, and a building department decides what is allowed.
