---
title: "A railing has no path in it, so read one off the top rail"
seo_title: "IFC railing Length from geometry: Qto_RailingBaseQuantities"
date: 2026-11-22
tags: [ids-model-check, ventures, bim, ifc]
description: "IDS Model Check now fills a railing's Qto_ Length from its body: 29 of 54 stored Revit lengths offered, all within 0.05%, and the other 25 held back."
---

Balustrades, glass guards and handrails are quoted by the metre, and
`Qto_RailingBaseQuantities` has one quantity for that: `Length`, "the total
nominal length of the railing". An IDS file that asks for it fails every
railing in an export that left it out. Until today
[IDS Model Check](../../ventures/ids-model-check/)'s model fill could measure
walls, beams, slabs, openings and rooms from their geometry. Railings went to
the to-fill table for a person to type in.

## What gets stored

Of 481 railings in the 36 public IFC files I use for testing, 54 store a
Length, all of them from Revit. Revit's figure is the railing's path. A
balcony rail in a small Revit 2022 flat bends twice: its top rail's middle line
runs 2.539 + 5.948 + 2.539 = 11.026 m, and the export stores 11.03.

The body doesn't contain that path. It is a pile of solids: 20 posts, 13
glass panels, two mid rails and the top rail, 36 shells in all. Nothing in it
says which way the railing runs.

## Reading it off the top rail

The top rail is the one part that follows the whole path, and from above it is
a thin strip. The reader keeps the upward faces that nothing else lies above.
That condition matters. My first try kept every face within 3 cm of the top,
which also kept the posts' tops, right under the rail, and read 12.27 m for
11.03.

Then a strip of width w along a path of length L with mitred corners has area
L·w and outline 2L + 2w. Measure the area and the outline and you can solve
for L. As a check, the rail is read a second way: its volume over its
cross-section. Both readings have to agree within 1%, or no figure is written.

The check catches real failures. A round stair handrail exported as long thin
triangles has a zigzag edge where the "faces up" test cuts across its facets,
so its strip reads 52% long while the volume reading is within 1.1% of the
stored figure. They disagree, so nothing is written. A railing broken at a post
gives two runs, and those add up; one in the Revit 2019 school model is 4.289
+ 3.844 m against a stored 8.128. A mid rail or handrail beside the top rail is
not counted a second time.

## How it scored

On the two exports that store a Length:

| Export | Stored | Offered | Within 2% | Worst |
| --- | ---: | ---: | ---: | ---: |
| Revit 2022 flat | 8 | 8 | 8 | 0.02% |
| Revit 2019 school | 46 | 21 | 21 | 0.05% |

I went through the 25 it held back one by one. Sixteen are bodies made only of
upright extrusions: posts or balusters with no rail at all, because Revit wrote
the rail as some other element or not at all. Nine have readings that
disagree. With the stored lengths hidden, the fill wrote the 29 and IfcTester
moved exactly those 29 railings from fail to pass.

ARCHICAD doesn't store a Qto_ railing length. It does keep its own parameter,
`Länge (A)`, and on the FZK-Haus sample's two railings the reading gives 2.000
and 4.290 m, which match it exactly.

The method, every held-back railing and the scripts are in
[`eval/railing-lengths-2026-11-22.md`](../../ventures/ids-model-check/eval/railing-lengths-2026-11-22.md).
Next is the two corner cuts among the nine, where the section is cut in the
wrong place. After that come the round handrails, which need their strip read
from a fitted tube rather than from thresholded facets.
