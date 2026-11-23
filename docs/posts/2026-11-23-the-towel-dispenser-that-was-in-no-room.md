---
title: "The towel dispenser that was in no room"
date: 2026-11-23
tags: [ids-model-check, ifc-quantity-takeoff, ventures, bim, cobie]
description: "Recessed fittings sit half inside their wall, so no room holds their middle. Sampling their whole box puts 37 of 37 in the room the model names."
---

A COBie handover workbook lists every maintainable component and the room
it is in. Revit usually exports a component on a storey, not in a room, so
[IDS Model Check](../../ventures/ids-model-check/README.md) works out the
room from geometry: it finds the room whose solid holds the component's
body. To test this on 25 public models, we hide the room the file itself
names and see whether the geometry finds the same one. This morning it found
the file's room for 1,068 of 1,227 components. Another 64 got no room at all.

Most of those 64 were towel dispensers, grab bars and fire extinguisher
cabinets. The tool had two separate problems with them.

**They had no box.** Revit writes these fittings as faceted surface models.
Their shells are almost closed, but not quite. The takeoff engine rightly
refused to cut a section through an open shell. It also threw away the
shell's points, so the fitting had no extent at all. A pull request from two
days ago had already fixed this ("open shells keep their box"), but it sat
unmerged behind an unrelated conflict. We ported its geometry change and its
test. The fix gives 362 more elements a box across the 25 files, and no
volume, area or length changes.

**Their middle is inside the wall.** A semi-recessed towel dispenser is
about 15 cm deep, and 10 cm of that sits in the wall cavity. The middle of
its box falls in no room, because rooms stop at the wall face. When the
usual middle-of-box tests find nothing, the tool now tests 125 points
spread through the box and picks the room most of them fall in. That rule
runs only when nothing else placed the element, so no component that was
already placed can move.

| contained components, room hidden (1,227) | before | after |
| --- | --- | --- |
| placed in the file's room | 1,068 | 1,117 |
| placed in another room | 95 | 93 |
| left blank | 64 | 17 |

The box sampling placed 37 components, and all 37 landed in the room the
model names: 25 in a dental clinic, 6 in an office, 6 in a small flat.

What's left is 17 cabinets and counter tops in two dental rooms. They sit
inside each room's bounding box but outside the room's solid at every
sample point. That is a question about how those rooms were modelled, and
it is the next thing to look at. The full measurement is in
[the eval note](../../ventures/ids-model-check/eval/cobie-wall-hosted-2026-11-23.md).

IDS Model Check is free and MIT licensed, and it runs in a browser tab. The
model never leaves your machine.
