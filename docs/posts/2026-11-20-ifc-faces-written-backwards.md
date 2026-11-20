---
title: "IFC mesh faces written backwards, and what the stored areas that miss really are"
seo_title: "IFC mesh faces written backwards: why stored areas miss"
date: 2026-11-20
tags: [ifc-quantity-takeoff, ventures]
description: "Turning reversed mesh faces fixed 58 Revit volumes, and four rules named 1,141 of the 1,499 stored IFC areas our takeoff could not explain."
---

Earlier today the [IFC quantity takeoff](../../ventures/ifc-quantity-takeoff/)
learned to [cut mesh bodies with a plane](2026-11-20-cutting-a-triangle-mesh-with-a-plane-ifc-areas.md),
and that gave 4,251 more stored areas to check against geometry. It also left
1,499 disagreements without a known cause, most of them on small ArchiCAD
pieces. This follow-up is about those, and about one assumption under all of
it.

## Faces that point the wrong way

Both the mesh section and the mesh volume assume each face's outline runs
counter-clockwise when you look at it from outside. Files don't always keep to
that. A closed mesh contains the information to fix it: across every shared
edge, the two faces must run the edge in opposite directions. So we walk the
faces from the first one, turn over any that disagree with a neighbour, and
turn the whole shell over if it then encloses a negative volume. A mesh where
some edge has one face, or three, isn't closed, so it isn't cut at all.

349 elements on the eight test models had faces turned. The volume check
already had a puzzle: 58 Revit members in the HHS Office model came out 39 to
43% over their stored GrossVolume, and nothing explained it. Their surface
models have reversed faces, which the divergence theorem counted with the
wrong sign. With the faces turned, all 58 agree, and stored GrossVolumes now
match the geometry for 4,863 of 5,495 elements on 13 models.

## Checking the cut a second way

We also wrote a sampler that shares no code with the cut. It puts a 200 x 200
grid of points on each plane and counts a point as inside when a ray from it
crosses the mesh an odd number of times. On 548 sections the median gap was
0.002%. We traced the one case outside tolerance by hand: two shells sharing a
face plane, which breaks ray parity. The cut itself was right.

## What the misses are

Four patterns, each read on several elements before becoming a rule, take the
unexplained count from 1,499 to 358 out of 12,130 pairs:

- **Centre-line figures (612 pairs).** A wall with angled ends stores
  Length x Width as its footprint, or Length x Height as its side. One
  schependomlaan wall stores 0.0578 m² (0.578 m x 0.1 m), while its volume /
  height and its cut both give 0.0645 m². Some methods of measurement use the
  centre line, so the takeoff keeps the stored number and shows why it differs.
- **A face, not the middle (409, was 57).** Sloped and tapered roof slabs
  store their top or bottom face. One dormer roof stores 1.0464 m², which is
  its top face; at mid-thickness it is 0.9976 m².
- **Zeros (96).** Window sills that store an area of 0. The takeoff uses the
  computed one.
- **Another width (81).** Walls shorter than they are thick, where which
  direction counts as "width" is the file's choice and the geometry can't
  settle it.

What's left: 111 mullion cross-sections in one Revit model, 54 ArchiCAD side
areas that fit no rule we've found, and a scatter of small pieces. Every
number, the sampler and the hand checks are in
[eval/faceted-causes-2026-11-20.md](../../ventures/ifc-quantity-takeoff/eval/faceted-causes-2026-11-20.md).
