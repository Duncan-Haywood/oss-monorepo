---
title: "Cutting IFC mesh bodies for areas: 2,051 uncut elements down to 6"
date: 2026-11-20
tags: [ifc-quantity-takeoff, ventures]
description: "Our IFC takeoff now cuts areas from faceted breps and face sets. On 8 public models that added 4,094 checked areas and fixed 58 Revit volumes."
---

The [IFC quantity takeoff](../../ventures/ifc-quantity-takeoff/) checks the
areas an authoring tool stores in a model against areas it cuts from the
model's own geometry: a wall's side on its middle plane, a slab's plan at
mid-thickness. Until yesterday it could only cut bodies built from extrusions
and clips. Bodies stored as meshes (faceted breps, triangulated and polygonal
face sets) were skipped, and on eight public models that meant 2,051
elements with a stored area and nothing to check it against. 1,544 of them
were in one ArchiCAD model, schependomlaan.

## How a mesh is cut

A closed mesh cut by a plane gives one or more polygons, but joining up the
cut edges into loops is fiddly and fragile. You don't have to. Each face that
crosses the plane leaves a straight stretch on it. If you run every stretch
in the direction n x f (the plane's normal crossed with the face's outward
normal), the stretches together go round the section's boundary
counter-clockwise. Green's theorem then gives the area as a sum over the
stretches, in any order. A face with a hole runs the other way round its
hole, so the hole's stretches subtract themselves.

That only works if every face points outward, and in real files they don't
all. So the faces are first turned to agree with their neighbours: across
every shared edge, the two faces must run it in opposite directions. Then the
whole shell is turned outward if it encloses a negative volume. A shell where
an edge belongs to one face, or to three, isn't closed and isn't cut.

To check the cuts we wrote a separate method that shares no code with the
first: sample a 200 x 200 grid on each plane, and count a point as inside
when a ray from it crosses the faces an odd number of times. Across 548
sections the median gap was 0.002%. We traced the one remaining outlier by
hand: a zinc flashing with a 1 mm leg, thinner than the sampler's 2 mm grid
cell.

## What the stored areas turned out to be

The cut areas give 4,094 new stored-against-computed pairs, and 2,160 of them
agree within 2%. Most of the rest follow four patterns, each read by hand
before it became a rule:

- **Upright coverings store their plan (742 pairs).** ArchiCAD exports a
  façade's insulation layer as `IfcCovering` with GrossArea = its footprint.
  One piece stores 0.0349 m², which is 0.303 m x 0.115 m. Its face is
  0.303 m x 3.435 m = 1.041 m², and its stored volume divided by its stored
  thickness agrees with the face. Insulation is priced by face area, so the
  bill of quantities uses the computed figure.
- **Centre-line footprints (612).** A wall with angled ends stores its
  centre-line Length x Width as its footprint. #13529 stores 0.0578 m², while
  its volume / height and the section both give 0.0645. Some methods of
  measurement work this way, so the stored figure is kept and the reason is
  shown.
- **Stored zeros (96).** Window sills that store an area of 0. The computed
  one is used.
- **Measured across another width (81).** Walls shorter than they are thick,
  where "width" is a choice the file makes and the geometry can't.

The face orientation fix also turned up something about volumes. The volume
check had 58 Revit members in the HHS Office model computed 39 to 43% over
their stored GrossVolume, with no cause found. Some of their faces were written
reversed, so the divergence theorem counted those faces with the wrong sign.
With the faces turned, all 58 agree. On 13 models, stored GrossVolumes now
agree with the geometry for 4,863 of 5,495 elements (was 4,805).

## What's left

271 disagreements still have no named cause, out of 11,977 pairs, 113 of
them one Revit model's mullions. Openings aren't yet subtracted from mesh
bodies, so a faceted wall with a window has a gross area but no net one.
That's next. The method, the sampler and every figure are in
[eval/faceted-sections-2026-11-20.md](../../ventures/ifc-quantity-takeoff/eval/faceted-sections-2026-11-20.md).
