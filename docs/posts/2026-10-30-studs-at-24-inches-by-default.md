---
title: "Shed studs at 24 inches by default, when the siding allows it"
date: 2026-10-30
tags: [shed-designer, framing, cost]
description: "The shed designer framed every wall at 16-inch centres. Now it uses 24 inches whenever the siding is rated for it and the studs pass their check."
---

The [shed designer](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/shed-designer/) framed every wall with studs at 16" on centre unless you changed it. That is house habit. The real limit on a shed wall is usually the siding, not the studs:

- T1-11 and LP's 3/8" SmartSide panel are rated for studs at 16" (see the stamp on the panel), because the panel is the wall's only sheathing;
- LP's 7/16" panel, and lap siding (LP lap, fiber cement, vinyl) over OSB, take 24".

Our cost search could already pick 24" as one of its knobs, but it didn't always get there. Seven of the eleven designs in the gallery have fiber cement lap siding, and all seven were framed at 16".

**What changed.** A new "Studs at 24" where the siding allows it" box is on by default. When it is on, the tool frames at 24" if two things hold:

1. the siding is rated for 24";
2. a 2x4 stud at 24" passes its check on the tallest wall (roof dead load and snow on the eave wall, plus wind on the face, NDS 3.9-3).

If either fails, the walls stay at 16". With no siding at all there is no sheathing, so they stay at 16" too. Picking a spacing yourself turns the box off. The search no longer treats stud spacing as a knob at all, unless you fix one. Its only value is the default, because a fixed 16" next to it is the same shed with more studs, and a fixed 24" only passes where the default already picks 24".

**The check that sends it back to 16".** Take the 8x10 default, lap-sided, with 100 psf of snow, 40 psf of wind and 10 ft walls, at a fixed 5/12 pitch and 12" overhang. A 2x4 at 24" comes out at 1.02 of its capacity, so it fails and the walls stay at 16". Let the tool lower the pitch or shorten the overhang and the roof load drops: the same stud passes at 24". The spacing is worked out again after those automatic settings, so the stud check always sees the roof that is actually built.

**What it saves.** Among the presets, only the 10x10 barn has lap siding. It drops from 58 studs to 44 and costs $55 less, and every check still passes.

In the gallery, all seven lap-sided designs now come out at 24". The figures below are at the tool's sample prices:

- four keep everything else and save $36 to $82 each (the best-looking 10x9, the 7x12, the 14x7 barn and the 10x10 mower shed);
- the 10x10 to match the house also swapped its plywood floor for OSB and costs $55 less;
- the "square" 10x10 changed shape (the search picked a gable over a lean-to) and costs $33 less;
- the long 6x16 drops by $211. With one knob gone, the search used its budget on others and also found 2x4 floor joists and rafters at 24".

The panel-sided presets don't move. If you want 24" on those, choose LP's 7/16" panel or lap siding over OSB.

The tool is a planning aid. It is not engineered or code-checked, and a building department may ask for something different.
