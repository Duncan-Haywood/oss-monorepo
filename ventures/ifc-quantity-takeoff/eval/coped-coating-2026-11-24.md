# Coped steel: a coating area for bodies cut by faceted solids, checked three ways, 2026-11-24

**Question.** [coating-area-2026-11-24.md](coating-area-2026-11-24.md) gave
797 of 825 steel parts on 8 public models a coating area. It left 28 without
one: S_Office's coped members (`Steel Universal Section 250 x 250`), each an
`IfcExtrudedAreaSolid` less one or two `IfcFacetedBrep` cut-outs by
`IfcBooleanResult` DIFFERENCE. The takeoff reads their volumes, but their
bodies are 483 to 858 signed convex pieces, and no route summed their faces.
Can the bill of quantities give them a coating area it can stand behind?

**Data.** `ThatOpen/engine_web-ifc` `tests/ifcfiles/public/`: the same 8
models with steel parts as the earlier note (a blob-less sparse clone, not
committed). The 28 parts are 14 columns `SC-056`, 6 beams `SB-168` and 8
beams `SB-174`.

## Method

The obvious first try was `planeAreas(body, true)`. It sums each plane's loops
as one area vector, each loop with its piece's sign, so faces that two pieces
share cancel. It read all 28. Then I checked it against IfcOpenShell 0.9's own
boolean (`eval/coped-ifcopenshell.py`) on the bodies whose volumes the two
programs agree on, and it came out high on some and low on others: SB-168
#796414 0.0072 m2 short, SC-056 #485016 0.089 m2 over.

Two faults explained it.

1. **Two faces on one plane, facing opposite ways.** A cope cut flush with a
   flange's underside leaves the web's top facing up on the same plane where
   the flange's underside faces down. One area vector per plane subtracts one
   from the other. On #796414, IfcOpenShell has 0.0018 m2 of up-facing web top
   on each of the two flange-underside planes. The vector sum was short by
   twice that on each, which is the 0.0072 m2.
2. **Planes that do not meet to the last bit.** The pieces cut by different
   cut-outs lie up to about 0.001 mm off the flange planes, and their normals
   differ in the 7th decimal. Exact plane keys left their shared faces
   uncancelled, which is where the excess came from.

`boundaryArea(s)` in `geom.mjs` does it differently. Each plane's loops are
added as a winding function, each loop counted with its piece's sign and the
side of the plane it faces. The face area is the integral of |winding|.
Shared faces cancel to 0, and a face up and a face down on one plane both
count. The integral is taken in slabs between every vertex and every edge
crossing. Within a slab the winding is constant between neighbouring edges,
so the result is exact for polygons. Planes are grouped in two passes: first
to 1e-7, then whole groups within 1e-4 in the cosine of their normals and
2e-5 of the body's size in offset. A group is joined to others but never split, because splitting loop by
loop broke a filleted I section. Its fan of near-parallel diagonals (planes
1e-4 apart) lost its shared faces' partners, and the face sum doubled
(engine.test.mjs, the filleted I test).

`takeoff` uses it for a steel part in a coated class when neither the body's
own faces nor the profile route gives a skin. It is also used in place of the
profile route's volume scaling on a clipped member that is not hollow (below).
Hollow sections keep the profile route, which reports the bore separately.

## Three checks, none sharing this code

- **IfcOpenShell 0.9** (`eval/coped-ifcopenshell.py`): its own boolean,
  triangulated; area and volume from the triangles.
- **Monte Carlo volume** (`eval/coped-mc-volume.py`): 300,000 points in the
  base extrusion's box. A point is in the body when it is inside the base
  and outside every cut-out, tested by ray parity on each operand's own
  triangles (IfcOpenShell triangulates each operand alone, with no boolean).
- **Crofton area** (`eval/coped-crofton.py`): random lines meeting a box K
  cross a surface of area A on average 2A/S_K times (Cauchy-Crofton). The
  script counts where membership (as above) changes along 100,000 isotropic
  lines. Hits within 0.01 mm of each other count as one point. Without that,
  the cut-outs' faces sitting 0.001 mm off the flanges count as thin slivers:
  on #796414 the area falls from 6.787 to 6.689 m2 as the tolerance goes from
  1e-7 to 1e-5 m, and stays there at 1e-4 m.

One body of each distinct geometry (the other 18 are copies at other
places, with the same figures to 1e-5):

| part | volume here m3 | IfcOpenShell m3 | Monte Carlo m3 | area here m2 | IfcOpenShell m2 | Crofton m2 (±1σ) |
|---|---:|---:|---:|---:|---:|---:|
| SC-056 #483899 (7 alike) | 0.126585 | 0.129334, uncut | 0.126492 ± 0.000405 | 11.88510 | 12.13544, uncut | 11.9121 ± 0.0224 |
| SC-056 #485016 (7 alike) | 0.125938 | 0.125938 | | 11.82452 | 11.82452 | 11.8275 ± 0.0223 |
| SB-168 #510150 (and #796047) | 0.073254 | 0.075073, uncut | 0.073117 ± 0.000235 | 6.90707 | 7.05728, uncut | 6.9084 ± 0.0131 |
| SB-168 #796414 (and #797639) | 0.070886 | 0.070886 | | 6.68311 | 6.68311 | 6.6859 ± 0.0127 |
| SB-168 #796905 | 0.072070 | 0.072071 | 0.072135 ± 0.000233 | 6.79457 | 6.79458 | 6.7926 ± 0.0129 |
| SB-168 #797272 | 0.070883 | 0.070883 | | 6.68278 | 6.68278 | 6.6788 ± 0.0127 |
| SB-168 #801994 | 0.072067 | 0.072067 | | 6.79425 | 6.79426 | 6.7898 ± 0.0129 |
| SB-174 #794361 (8 alike) | 0.012345 | 0.011622 | 0.012349 ± 0.000085 | 1.22717 | 1.15048 | 1.2272 ± 0.0038 |
| control: SB-001 #37780, uncut | 0.064766 | 0.064766 | | 6.09269 | 6.09269 | 6.0881 ± 0.0114 |

- **Where IfcOpenShell's volume agrees (11 parts), the faces agree to
  1e-5 m2**: 11.82452, 6.68311, 6.79457, 6.68278, 6.79425.
- **Where it does not (17 parts), IfcOpenShell is the one off.** On 7 SC-056
  and 2 SB-168 it leaves the body uncut, at the bare extrusion's volume and
  area: 12.13544 m2 is 1,469.40 mm of outline x 8,237.39 mm plus both ends,
  worked from the profile's points. On SB-174 it removes more than the
  Monte Carlo count allows: 0.011622 against 0.012349 ± 0.000085 m3. The
  Monte Carlo volumes agree with ours to within one standard error on all
  four bodies sampled.
- **Crofton agrees with every area here within 1.4σ** (SB-174: 1.2272 ±
  0.0038 against 1.22717).
- manifold3d (another mesh boolean) read 6 of the 10 distinct bodies and
  agreed with our volume on all six. Its areas run 0.06 to 0.18 m2 high.
  manifold perturbs coplanar faces, which leaves a zero-thickness skin
  where a cut-out's face lies on the beam's, and that skin counts twice. Its
  areas are not used.

## Clipped members: the volume scaling was low

Before this change, a member clipped by half-spaces took its profile's
sides scaled by volume, which assumes square end cuts. On S_Office the faces
now give more: SB-056 #484003 1.58121 m2 (was 1.57427), SB-154 #509096
1.17235 (was 1.16542), SB-352 #998905 0.98659 (was 0.97966). IfcOpenShell
gives 1.58121, 1.17235 and 0.98659 for the same three. The scaled figure was 0.4 to 0.7% low
on these short, skew-cut beams.

## Result on the 8 models

`node eval/coating-area.mjs <files> --json eval/coped-coating-2026-11-24.json`:
[coped-coating-2026-11-24.txt](coped-coating-2026-11-24.txt).

| model | steel parts | from geometry | stored only | none | coating m2 (was) |
|---|---:|---:|---:|---:|---:|
| ISSUE_021_Mini Project (Tekla) | 177 | 177 | 0 | 0 | 605.02 (605.09) |
| ISSUE_068_ARK_NUS_skolebygg | 1 | 1 | 0 | 0 | 1.64 (1.64) |
| ISSUE_102_M3D-CON-CD (Tekla) | 63 | 63 | 0 | 0 | 60.66 (60.66) |
| ISSUE_126_model | 1 | 1 | 0 | 0 | 5.71 (5.71) |
| S_Office (Revit) | 306 | 306 | 0 | 0 | 2,190.68 (1,968.53, 28 none) |
| duplex (Revit) | 8 | 8 | 0 | 0 | 63.11 (63.11) |
| example (Revit) | 73 | 73 | 0 | 0 | 183.19 (183.19) |
| schependomlaan (ArchiCAD) | 196 | 196 | 0 | 0 | 227.69 (227.69) |
| **8 models** | **825** | **825** | **0** | **0** | **3,337.70 (3,115.61)** |

**825 of 825 steel parts now have a coating area, all from their geometry**
(797 before, 2 of them from stored figures). I compared each part's figure
with main's code part by part. 52 parts moved and none of the other 773
changed:

- **S_Office, 28 filled**: 222.01 m2, the coped members above.
- **S_Office, 21 clipped members up** 0.146 m2 in all (the beams in the
  section above, each about 0.007 m2).
- **Mini Project `STEELDECK` #3305** (a clipped member): 7.56563 to 7.58268
  m2, which is now exactly what Tekla stored (7.58268).
- **Mini Project's two `KOKER` angles** (#10087, #10618: an L200/100/10 less
  a rectangular notch) used to take Tekla's stored OuterSurfaceArea, 1.578 and
  1.440 m2. That figure is the uncut angle's outline times its length, with no
  notch and no ends. They now read 1.52138 and 1.41145 m2. Crofton gives
  1.5062 ± 0.0041 and 1.399 ± 0.004, and IfcOpenShell 1.50562 and 1.39641.
  So ours is about 1% high, but nearer than the stored figure (5% high). The
  error is in the body, not in the face sum: our volume is 0.007526 m3, while
  Monte Carlo gives 0.007446 ± 0.000029, IfcOpenShell 0.00747 and Tekla's
  NetVolume 0.007399. The same error was there before this change, inside the
  2% volume check. It is now an open item (NEXT.md).

## What this does not show

- That IfcOpenShell is wrong in general. On these 17 bodies its boolean
  leaves the cut out or removes too much, against two counts that share no
  code with ours or with each other's boolean. On the other 11 it agrees with us to 1e-5.
- That boundaryArea is right on bodies like none of these. Its plane
  tolerances were set on S_Office and the filleted test section. A body
  whose faces really are within 2e-5 of its size of each other (a sheet
  that thin) would have them joined.
- A clipped hollow section still takes the scaled profile, so a skew-cut
  tube's skin keeps the old approximation.
- `planeAreas(body, true)` keeps the opposite-faces fault where other checks
  use it (a slab's per-plane areas for ArchiCAD's stored face areas). Those
  bodies are clipped by a plane, not coped, and no stored figure was found
  that it changes. That has not been tested.
