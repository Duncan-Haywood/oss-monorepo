---
title: "Cutting an IFC mesh with a plane: 4,251 more stored areas checked"
date: 2026-11-20
tags: [ifc-quantity-takeoff, ventures]
description: "Our IFC takeoff now cuts triangle meshes by a plane. On 8 public models, 2,915 of 4,251 newly checked stored areas agree; most misses are small pieces."
---

Yesterday's [IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/)
learned to cut areas out of a model's geometry: a wall's side area on its
middle plane, a slab's plan, a member's cross-section. It skipped every
element whose body is a triangle mesh or a faceted brep. That came to 2,051
elements on our eight test models, 1,544 of them in one ArchiCAD house
(schependomlaan), which exports most of its walls, slabs and cladding that
way. A takeoff that goes quiet on most of a model isn't much of a
check.

## The trick: you never build the section

A cleaner approach is to clip the mesh, stitch the cut edges into polygons,
and measure those. That falls apart on concave faces, holes and loose
vertices. We used a shortcut instead.

Fan each face into triangles. Wherever the plane crosses a triangle, the part
below the plane has exactly one edge lying in the plane: from the point where
the triangle's boundary leaves the half-space to the point where it comes
back. Over a closed shell those little edges join up into the outline of the
section, whatever shape it is. Green's theorem then gives the area as half
the sum of the cross products of each edge's ends. So the area is a single
sum over triangles. No polygon gets assembled, and concave faces, several
pieces and holes in the section need no special handling. A void inside a
brep is the same sum with the sign flipped.

The tests check it by hand. An L-shaped prism with concave L faces cuts to
4 m² at any height and 2√2 × 2 on the diagonal. Reversed faces flip the sign.
A void comes out only where the plane crosses it. And the sample office's
5 × 4 m floor slab, rewritten as a faceted brep and as a triangulated face
set, gives the hand-worked 20 m² both ways.

## What the meshes said

| | Before | Now |
|---|---:|---:|
| Stored areas checked | 7,883 | 12,134 |
| Agreeing within 2% | 6,509 | 9,424 |
| Elements skipped as faceted | 2,051 | 5 |

Of the 4,251 newly checked areas, **2,915 agree (68.6%)**. That's well below
the 83% for extruded bodies. Most of the misses are small: 1,051 of the 1,225
we can't explain store under 0.6 m². They're brick-leaf pieces at corners,
copings and window sills. On pieces of 0.6 m² or more, 78% agree, and by
stored area 74% of the faceted area agrees. All stored volumes on all 13
corpus models came out exactly as before, line for line.

## One choice we fitted, and said so

A mesh has lost its extrusion direction, so which plane gives a cladding
panel's "area"? Across its thinnest direction (the face), only 196 of 728
faceted coverings in schependomlaan agreed. Normal to the element's up
direction, 533 did. ArchiCAD stores the plan outline it extruded upward, so a
74 mm insulation board standing 0.37 m tall stores 0.095 m² (its plan), not
its face. Slabs go the other way: sloped roof slabs agree better when cut
across their thickness. So coverings are cut normal to up, slabs across
their thinnest direction. That rule was fitted on one model, the only one in
the set with faceted coverings, and the write-up says so.

## Still not done

Openings are not taken out of a mesh, and a mesh clipped by a plane isn't cut.
The small-piece misses are listed but not explained. Next is a
method-of-measurement layer, so the bill of quantities deducts openings the
way a quantity surveyor's rules do, not all of them.

Every number, the method and the raw output:
[eval/areas-vs-stored-2026-11-20.md](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ifc-quantity-takeoff/eval/areas-vs-stored-2026-11-20.md).
The tool is free and MIT licensed, and the model is read in your browser tab.
