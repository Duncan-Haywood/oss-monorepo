# Curved advanced breps read: surfaces of revolution, extrusion and B-splines, 2026-11-20

**Question.** After [advanced-breps-2026-11-20.md](advanced-breps-2026-11-20.md)
the tool read every `IfcAdvancedBrep` whose faces lie on planes and cylinders,
and reported the rest as "not read: advanced face on ...". Can faces on
surfaces of revolution, surfaces of linear extrusion and B-spline (NURBS)
surfaces be read too, and do the volumes hold up?

**Data.** The 28 `.ifc` models in `ThatOpen/engine_web-ifc`
`tests/ifcfiles/public/` (blob-less sparse clone; the two `.ifczip` files not
opened), surveyed for advanced breps the tool could not read. Two have them:

| Model | Advanced breps | Not read before | Why |
|---|---:|---:|---|
| ISSUE_159_kleine_Wohnung_R22 (IFC4) | 775 | 8 | 7 surface of revolution, 1 rational B-spline surface |
| FM_ARC_DigitalHub (IFC4) | 1,314 | 22 | 15 surface of revolution, 3 rational B-spline, 1 linear extrusion, 3 cylinder faces whose bounds were not read |

The reference is IfcOpenShell 0.9.0 (pip, OpenCASCADE), each brep on its own at
0.05 mm / 0.02 rad (`eval/ifcopenshell-volumes.py --breps`, 3 min and 12 min).

What the faces are: the surfaces of revolution are torus patches (a circle
profile, the bends of pipes and handles) and cone patches (a line profile);
the B-spline surfaces are ruled (degree 3 by 1) or bicubic 11 by 11 patches;
the extrusion sweeps a B-spline profile. 26 of the 27 faces have one bound of
four edges (circles, lines, B-spline curves).

## How a curved face is read (`surface.mjs`, `Geometry.surfaceTriangles`)

1. **A parameter map** for the surface: (u, v) to a point, and a point back
   to (u, v). A surface of revolution with a line or circle profile, in a
   plane through its axis, by formula (angle round the axis, and the line's
   parameter or the angle round the profile circle); a B-spline surface
   (rational too) by de Boor's algorithm, inverted by Gauss-Newton from the
   last point's (u, v) or the nearest of a 25 by 25 grid; a surface of linear
   extrusion as its B-spline profile plus a distance, inverted the same way.
2. **The boundary to (u, v).** The edges are sampled as before (arcs at 360
   segments to the turn, B-splines at 16 points to a knot span), each point
   is taken to (u, v), angles unwound along the loop. A face whose loop goes
   once round a closed parameter (a band or a cap) is not read. Every point
   must lie within 1e-3 of the face's size of the surface: exporters write
   B-spline surfaces that only approximate their circular edges (kleine_Wohnung's
   ruled faces sit 2e-4 of their size off them), and the triangles keep the
   boundary points as given.
3. **Poles.** Where the surface pinches (a cone's tip, the narrow end of a
   ruled face), one point stands for a whole segment in (u, v). The point is
   written twice, at the pinched parameter of its two neighbours, and the
   triangles on its two copies, which have no area, are dropped at the end.
4. **Straight runs set aside.** A densely sampled edge along a parameter
   line (a torus patch's circles) or gently bending in (u, v) is set aside
   down to its two ends (points within 1e-3 of the loop's size and 1e-2 of the
   chord of the line between them). Without this, a quarter torus came out in
   67,456 triangles and a pipe bend in 115,552; with it, 3,882 and 4,798.
5. **Triangulate and refine.** The loop of run ends is cut by walking it
   along u or v (as cylinders are) or by ear clipping, keeping the first cut
   whose edges pair up and whose pieces all have area. Triangles are then
   halved by longest-edge bisection (Rivara) until every inner edge's
   midpoint on the surface lies within 2e-4 of the face's size of the
   straight edge. A boundary edge is halved only at a set-aside point, the one
   nearest its middle that folds nothing over, so no point is ever added to
   the boundary and the face meets its neighbours point for point. The
   points still set aside are finally fanned to the triangle on their edge.
6. The triangles go through the faceted path like any other face: turned to
   agree across shared edges, volume by the divergence theorem, sections.

Four ways the refinement ran without end were found on these faces and closed:
a cone's twisted chords (a parameter-space diagonal is not a straight line on
the surface; the profile's radius is now signed in its meridian plane), a
triangulation with pieces of no area (the walk along u makes them at a
straight side), bisection toward an edge that cannot be halved (the
neighbour is refined first only while its own longest edge can be halved),
and inner edges no shorter than the boundary's own sampling (an edge is not
halved below the longest boundary step that is itself out of tolerance).

## Results

**Each brep against IfcOpenShell** (`eval/breps-vs-ifcopenshell.mjs`, output in
[curved-breps-vs-ifcopenshell-2026-11-20.txt](curved-breps-vs-ifcopenshell-2026-11-20.txt)):

| | kleine_Wohnung | FM_ARC_DigitalHub |
|---|---:|---:|
| Curved breps (other than cylinders) | 8 | 19 |
| Read now | 7 | 17 |
| Within 0.3% of IfcOpenShell | 6 | 7 |
| IfcOpenShell wrong by formula (below) | | 4 |
| IfcOpenShell's volume larger than the brep's box | | 2 |
| Overlapping pieces (summed, with a note) | | 1 |
| Unexplained | 1 | 3 |
| Still not read | 1 (a face round the whole surface) | 2 (bounds 5e-3 of the face's size off their surface) |

Planar and cylindrical breps are unchanged: kleine_Wohnung 601 + 102 agree as
before; FM_ARC_DigitalHub 1,130 of 1,148 planar and 135 of 144 cylindrical.

**The figures run light by 0.02-0.3%, as they should.** The triangles are
inscribed: on a convex face they lie inside it. kleine_Wohnung's four cone
fittings are 0.027% under IfcOpenShell, the bicubic patch 0.04% under, the
torus fittings 0.29% under. In the unit test a quarter torus comes out 0.12%
light. Tightening to 1e-4 of the face's size halves the gap and doubles the
triangles (kleine_Wohnung's ruled B-spline brep: 4.1212e-4 at 5e-4, 4.1275e-4
at 2e-4, 4.1293e-4 at 1e-4, 4.1311e-4 at 2e-5); 2e-4 is the default.

**Where IfcOpenShell is wrong, worked by formula:**
- #123495 and #133795, a ring whose section is a half disc (two torus faces
  and two cylinder faces, no planes). From the faces' areas the tube is
  ρ = 0.038 at R = 0.2998, flat side outward; Pappus gives
  2π · (πρ²/2) · (R − 4ρ/3π) = 0.004043. This tool: 0.0040357 (0.18% light,
  as above). IfcOpenShell: 0.02457, six times the solid.
- #126660 and #129298, a pipe bend: a torus tube ρ = 0.019 (from the profile
  circle) bent R = 0.0685 through 3.092 rad (from the faces' areas, which
  agree with both radii), and two straight runs of 0.0765 and 0.0218 (from the
  cylinder faces' areas). πρ²(RΔu + L1 + L2) = 3.517e-4. This tool: 3.524e-4.
  IfcOpenShell: 1.325e-4, less than the bend alone (2.40e-4).

**Unexplained: 207801 (19% over IfcOpenShell), 121421 (5% over), 128967
(21% under), 130735 (39% under).** Each face's mesh area agrees with the
surface's area integrated over its (u, v) region to 0.1%, and a ray-parity
count of points inside the mesh (6,000 to 20,000 points, `eval/ray-parity.mjs`) agrees
with the divergence-theorem volume within its noise on 207801, 121421 and
128967: the shells are closed and turned consistently. That does not prove
the figures right (a face could be read on the wrong side of its bound), so
they stay unexplained here.

**Elements** (`eval/stored-vs-computed.mjs`, [curved-breps-stored-vs-computed-2026-11-20.txt](curved-breps-stored-vs-computed-2026-11-20.txt)):
kleine_Wohnung reads 419 of 425 elements, up from 413 (the 6 left all use the
one brep with a face round its whole surface); FM_ARC_DigitalHub 690 of 705,
up from 662. No stored-volume pair changes: the newly read elements store no
volumes.

## Speed

kleine_Wohnung's takeoff runs in about the same time as before (3.7 s on main,
3-5 s here, noisy). FM_ARC_DigitalHub went from 4.7 s to 13.4 s: its pipe
fittings now carry several thousand triangles each, and every element
carries its body's mesh through the faceted path.

## What is left

- A face that goes once round a closed surface (kleine_Wohnung #162827, 6
  elements): needs a seam cut or a pole cap in (u, v). (2026-11-22: #162827
  was two dome halves meeting on the axis, read now; the four unexplained
  below are IfcOpenShell faces turned inside out:
  [pole-faces-2026-11-22.md](pole-faces-2026-11-22.md).)
- Two FM_ARC_DigitalHub breps whose face bounds sit 5e-3 of the face's size
  off their torus (0.45 mm on 90 mm), and three with cylinder faces the
  cylinder reader does not take (a hole, or a loop round the cylinder).
- Curved faces with holes (none in these models).
- The four unexplained disagreements above.
- Speed on fitting-heavy MEP models: the meshes could be coarser where the
  volume needs less (the tolerance is per face, not per solid).
