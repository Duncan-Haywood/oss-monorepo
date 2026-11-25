---
title: "A 1% steel volume error that was the section, not the boolean"
date: 2026-11-24
tags: [ifc-quantity-takeoff, ifc, bim, steel, geometry, ventures]
description: "Two notched steel angles read 1% heavy in an IFC takeoff. The cut was fine: the L section's toe radii were never drawn. Now within 0.02% of IfcOpenShell."
---

The [IFC quantity takeoff](https://marisstella.app/ifc-quantity-takeoff/)
reads a BIM model in the browser and turns it into a bill of quantities.
Every figure it computes is checked against the quantities the model stores
and against other programs. Two steel parts didn't agree. In a public Tekla
model ("Mini Project", from the web-ifc test files), two notched
L200/100/10 angles came out about 1% over IfcOpenShell and over a Monte Carlo
count. That held for both volume and surface area.

Each part is an angle with a rectangular notch cut out of one leg. The
earlier write-up guessed the boolean was at fault: subtracting a box from a
section with a rounded root. That guess was wrong.

## Working it by hand

An IFC L section is a set of numbers, not a drawing: depth 200, width 100,
thickness 10, root radius 15, **edge radius 7.5**. A 90-degree corner rounded
by radius r gains or loses r²(1 − π/4).

- legs: 200 × 10 + 90 × 10 = 2,900 mm²
- root fillet: + 48.29 mm²
- two toes, rounded on the inside: − 24.14 mm²
- section: **2,924.15 mm²**. The EN 10056-1 steel table lists 29.2 cm².

Our takeoff had 2,948.29 mm². That is legs plus root with no toes, 24.14 mm²
too much. Multiply by the 2,630 mm length, take back the one toe the notch
removes, and you get the whole excess. The boolean was exact. The section
was the problem.

## What changed

The profile reader handled each steel shape's root radius but skipped the
toe radii: `EdgeRadius` on L and U sections, `FlangeEdgeRadius` on I and T,
`WebEdgeRadius` on T. Z sections had lost their root radius too. Each corner
now gets its own radius, in the positions the IFC figures show.

On the public model, 17 angles change and none of the other 2,619 elements
move. The notched angle's volume is now 0.0074681 m³. The hand working gives
0.0074681 and IfcOpenShell 0.00747. Its coating area is 1.50586 m² against
IfcOpenShell's 1.50562, where it used to be 1.52138. Each angle's section now
matches its steel-table area, where before each was 0.7 to 0.9% over.

For a fabricator this is about weight and paint. The bill's steel tonnage and
coating area come from these sections. A 1% error on every angle in a job is
the kind that adds up without anyone noticing.

Method, numbers and what is still unchecked:
[eval/edge-radii-2026-11-24.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/edge-radii-2026-11-24.md).
The takeoff is free, MIT licensed, and your model never leaves your browser.
Treat its figures as estimates to check, not a substitute for a professional
quantity surveyor.
