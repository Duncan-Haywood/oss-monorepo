# IFC4X3 alignments: IfcLinearPlacement and IfcSectionedSolidHorizontal, 2026-11-22

**Question.** Viadotto Acerno, the one public IFC4X3 bridge in
`ThatOpen/engine_web-ifc` `tests/ifcfiles/public/` (33 MB, IFC4X3_ADD2), did
not read at all: the takeoff stopped on the first element placed with
`IfcLinearPlacement` ("object placement IFCLINEARPLACEMENT",
eval/member-length-weight-2026-11-22.md). Can its parts be placed on their
alignment, and can the 638 decks, girders, diaphragms and pavement courses
swept as `IfcSectionedSolidHorizontal` be measured?

**Data.** `Viadotto Acerno.ifc` (blob-less sparse clone of
ThatOpen/engine_web-ifc, `tests/ifcfiles/public`). Three alignments (bridge,
road, road under the bridge), each an `IfcGradientCurve` over a horizontal
`IfcCompositeCurve` of `IfcCurveSegment`s: 4 lines, 4 clothoids and 2 arcs
horizontally, lines and 8 km sag/crest circles vertically. 1,101
`IfcLinearPlacement`s; no `CartesianPosition` cached on any of them. 638
sectioned solids: 68 on the bridge's or road's gradient curve, 570 on their
own two-point 3D polylines (girder and diaphragm pieces).

## What was built (alignment.mjs)

- `IfcCurveSegment`: the parent curve (line, circle, clothoid, polyline) from
  SegmentStart for SegmentLength, negative lengths running it backwards, moved
  so its point and direction of travel at SegmentStart sit on Placement.
- `IfcGradientCurve`: horizontal point and heading at distance d along the
  horizontal; elevation and grade from the vertical, drawn in (d, z), by
  bisection on d.
- `IfcAxis2PlacementLinear`: the frame at the station is x along the tangent
  (with the grade), y level to the left, z square to the tangent in its
  vertical plane. OffsetLateral goes along y, OffsetVertical along z (the IFC
  4.3 text: "perpendicular to the tangent at DistanceAlong in the plane of the
  tangent perpendicular to the global XY plane"), OffsetLongitudinal as a
  straight step along x after both ("Offset parallel to the basis curve after
  applying DistanceAlong, OffsetLateral, and OffsetVertical"). The first
  version read OffsetLongitudinal as more distance along the curve and z as
  plumb; IfcOpenShell disagreed by up to 0.44 m, and the spec text sided with
  it on both counts.
- `IfcSectionedSolidHorizontal`: each cross-section square to the tangent at
  its station (profile x along the level y axis, to the left; profile y along
  z), its points moving linearly between stations, sliced every 0.25 degrees
  of heading. Each side between two slices is a fan of four triangles about the
  quad's mean point, which encloses a twisted (bilinear) quad's volume exactly.
  Distance along a 3D polyline is its 3D length.
- A placement it cannot draw (cant, other spirals, polynomial or offset
  curves) makes that element "not read: placement ..." and leaves the rest of
  the file; before, one such placement stopped the whole takeoff. A cached
  `CartesianPosition` stands in when the curve cannot be read.

## Results

**1. The curves against the file's own figures**
(`node eval/linear-placement.mjs`, raw output
[linear-placement-2026-11-22.txt](linear-placement-2026-11-22.txt)). Each
segment's end, as drawn here, against the next segment's Placement:

| Curve | Pieces | Worst joint gap | Worst turn |
|---|---|---|---|
| Bridge horizontal #159751 | 4 line, 4 clothoid, 2 circle | 6.6e-9 m | 1.6e-8 deg |
| Bridge vertical #159884 | 4 line, 2 circle | 2.3e-6 m | 4e-15 deg |
| Road horizontal #192342 | same | 1.1e-3 m | 3.8e-3 deg |
| Road vertical #192475 | same | 3.5e-2 m | 4e-15 deg |
| Lower road horizontal #252938 | same | 0.31 m | 0.39 deg |
| Lower road vertical #253071 | 2 line | 4.6e-13 m | 1e-16 deg |

The bridge closes to 1e-8 m through clothoids and arcs, so the segment
reading is right. The two roads' lengths are written to 3 decimals
(157.712, 27.948) and their Placements were not recomputed from them, so their
joints disagree with themselves; the 0.31 m gap is at the end of a 200 m arc
whose stated length is about 1.4 m short of where the next segment starts. A
station on those roads is placed from the segment it falls in, so its error
is at most the gap at that segment's end.

**2. Linear placements against IfcOpenShell 0.8.0**
(`eval/linear-placement-vs-ifcopenshell.py`, output
[linear-placement-vs-ifcopenshell-2026-11-22.txt](linear-placement-vs-ifcopenshell-2026-11-22.txt)):
all **1,101** origins within **1.1e-7 m** (median 2.7e-12 m), x axes within
8.5e-7 degrees.

**3. Sectioned solids** (`node eval/sectioned-solid.mjs model.ifc --boxes
ios.json`, output [sectioned-solid-2026-11-22.txt](sectioned-solid-2026-11-22.txt)).
IfcOpenShell's lofts of these solids are open shells (78 unshared edges on
the first deck), so its volumes are no reference. The reference instead is an
integral that meshes nothing: the interpolated section's area times its
centroid's path (Pappus, slice by slice, curvature from the directrix),
Gauss-Legendre with 64 points per station pair.

| Class | Elements | Volume here | Integral | Difference |
|---|---|---|---|---|
| IfcBeam (girders, diaphragms) | 572 | 3,259.596 m3 | 3,259.596 m3 | -0.0000% |
| IfcSlab (deck) | 19 | 1,889.354 m3 | 1,889.360 m3 | -0.0004% |
| IfcCourse (pavement layers) | 38 | 604.000 m3 | 604.002 m3 | -0.0004% |
| IfcPavement | 2 | 193.724 m3 | 193.725 m3 | -0.0004% |
| IfcRailing | 4 | 2.893 m3 | 2.893 m3 | -0.0007% |
| IfcSurfaceFeature | 3 | 0.755 m3 | 0.755 m3 | -0.0003% |

All 638 within 0.003% (median 2e-12). The pavement courses were the hard
case: their crossfall turns over between stations (a 4 cm layer whose left
edge rises 0.26 m in 25 m), and splitting each side quad along one diagonal
was 55% off on the worst; slicing finer converged only as 1/n (2.4% at 1 cm
steps), and the four-triangle fan made it exact.

World boxes against IfcOpenShell's: median 5.7e-14 m, 622 of 634 within
1 mm. The 12 others are span 4's diaphragms, whose second cross-section sits
at 0.705 m on a 0.505 m polyline. Here the loft carries on 0.20 m along the
end tangent; IfcOpenShell stops at the polyline's end. The file does not
say which is meant (a diaphragm 0.70 m thick is as plausible as 0.505 m), so
those 12 carry a note on their row. Before the 3D-length fix for polylines,
the boxes were off by a median 1.6 cm: distance along a climbing girder's
polyline is its 3D length.

**4. The takeoff.** `node cli.mjs "Viadotto Acerno.ifc" --check`
([linear-placement-viadotto-check-2026-11-22.txt](linear-placement-viadotto-check-2026-11-22.txt)):
6,448 elements (44 alignment segments, which are reference lines, no longer
listed), volume computed for **6,448**, not read 0. Before: the file did not
read. 12 s on this machine (11 s of it the 6,448 bodies; 4.3 s before the
lofts). A first version spent 30 s re-orienting the lofts' triangles, which
are built oriented: they now skip that pass.

The other 8 public models checked (AC20-FZK-Haus, Mini Project,
schependomlaan, ARK_NUS, ifcbridge-model01, KIT road, M3D-CON-CD,
dental_clinic) give byte-identical BoQ CSVs before and after.

## Left

- Cant (`IfcSegmentedReferenceCurve`) for rail, and the spirals IFC 4.3 lists
  besides the clothoid (cosine, sine, Bloss, Viennese, polynomial).
- Which reading of a station past its directrix's end is meant (the 12
  diaphragms); a second IFC4X3 bridge model would settle whether exporters
  mean it.
- Viadotto's piles and members are open face sets, so they get a volume but
  no box or length (PR #18042's open-shell boxes).
- `planRect` over long lofted railings costs about 3 s of the 12.
