# IFC Quantity Takeoff

A bill of quantities from an IFC building model, in the browser or on the
command line, with every element's volume recomputed from its geometry and
checked against the quantities the authoring tool stored.

**Live tool:** https://marisstella.app/ifc-quantity-takeoff/

Drop an `.ifc` (IFC2X3, IFC4 or IFC4X3). You get:

- **A bill of quantities** grouped by class, type, storey, material,
  classification code or **Uniformat II element** (an elemental estimate:
  A1010 Standard Foundations, B2010 Exterior Walls, C1010 Partitions ...): count, volume (m3), area (m2), length (m) and weight
  (kg) per line. Type a rate on a line (per each, m3, m2, m or kg) and the page
  prices it and totals the priced lines. Download as CSV.
- **Every element** as CSV: GlobalId, class, name, type, storey, material,
  classification, the computed gross and net volumes, the stored quantities,
  and the verdict of the check.
- **Areas from the geometry.** Each area a quantity set stores is cut from the
  element's body by a plane, as the set defines it: a wall's side area on its
  middle plane (gross, and net of openings), its footprint at its base (doors
  cut it, windows do not), a slab's, plate's, covering's or roof's area as its
  extruded profile, a column's, beam's or member's cross-section normal to its
  length. Faceted bodies (breps and triangle meshes) are cut through their
  faces. Where a wall or slab stores no area, the bill of quantities uses the
  cut one; where the stored area is known to be wrong, likewise.
- **The check.** For each element that stores a GrossVolume or NetVolume, the
  volume computed from its body (gross) and its body less its openings (net),
  and when they disagree by more than 2%, the likely cause: a split-by-level
  piece carrying the whole element's figure, a GrossVolume that is really net,
  a volume a power of ten off (written in the wrong unit), or a stored volume
  that contradicts the element's own stored length, height and width. Where the
  stored figure is the wrong one, the bill of quantities uses the computed one.

- **Small voids left in, as a method of measurement does.** Choose
  "deduct every opening" (as modelled), "leave in voids up to 0.50 m2 /
  0.05 m3", or your own thresholds (`--voids-up-to 0.5,0.05` on the command
  line). Each opening is cut from its element on its own, so the area it takes
  out of the wall's middle plane or the slab's plan and the volume it takes out
  of the body are known; openings at or under the thresholds are added back to
  net figures (or only the larger ones taken out of gross ones), and the BoQ
  says how many and what they added (`measure.mjs`). On 12 public models, 1,099
  of 1,136 wall openings that store their own width and height measured within
  2% of width x height; 216 of 2,252 openings were at or under 0.50 m2
  ([eval/measure-rules-2026-11-20.md](eval/measure-rules-2026-11-20.md)). The
  thresholds are yours to check against your contract's method; the tool
  claims no standard's rules.
- **What changed since the last issue.** Drop the earlier revision too and
  get the change on every bill-of-quantities line (priced with the same
  rates, for a change order) and every element added, removed, changed (a
  quantity or attribute), moved or resized, as CSV (`diff.mjs`). Elements are
  matched by GlobalId, then by Tag (Revit's ElementId, which survives an
  export that renews GlobalIds), then by place and volume; Revit parts in one
  issue and their host in the other are paired, not counted as removed and
  added ([eval/revision-diff-2026-11-20.md](eval/revision-diff-2026-11-20.md)).

Nothing is uploaded: the model is read in the browser tab.

## Why use it

| Today | What it costs | What this does differently |
|---|---|---|
| Revit or ArchiCAD schedules | the authoring tool and the native model | works on the IFC anyone downstream receives |
| CostX, Cubit, Autodesk Takeoff, Bluebeam 3D, Solibri ITO | a seat licence, a desktop install | free, a browser tab; does far less (no 2D takeoff or rate libraries); its revision comparison names elements that only look new |
| Free IFC viewers (BIMcollab Zoom, BIMvision, xeokit) | free | show stored properties one element at a time; no grouped, priced BoQ, no check of the stored figures |
| IfcOpenShell scripts | free | needs Python and a programmer |

The one thing none of them advertises: on 8 public models, 690 of 5,495 stored
GrossVolumes (12.6%) disagreed with the element's own geometry, and 147 of
those were provably the stored figure's fault. An estimate that sums stored
quantities inherits those errors; this tool says which they are
([eval/stored-vs-computed-2026-11-19.md](eval/stored-vs-computed-2026-11-19.md)).

## How it was checked

- **Hand calculations.** `samples/sample-office.ifc` is written by
  `samples/make-sample.mjs` so every volume can be worked by hand: a wall with
  a door opening (3.0 m3 gross, 2.58 net), a wall cut by a sloped plane (2.0),
  a wall split by level storing the whole wall's 3.6 m3 on each 1.8 m3 piece, a
  slab, a round column (pi x 0.15^2 x 3 m3) and an IPE 200 beam. `engine.test.mjs`
  checks each against the arithmetic, and the IPE 200 section against the steel
  tables (28.48 cm2; root radii included as (4 - pi) r^2).
- **Real models.** On 13 public models (Revit, ArchiCAD, Tekla and others), the
  computed volume agrees with the stored GrossVolume for 4,863 of 5,495
  elements and with NetVolume for 6,133 of 6,366; where they agree, the median
  difference is 8e-16. Every disagreement is classified in
  [eval/stored-vs-computed-2026-11-19.md](eval/stored-vs-computed-2026-11-19.md),
  with the raw output beside it (rerun 2026-11-20: 58 Revit members whose
  faceted faces were written reversed now agree,
  [eval/faceted-causes-2026-11-20.md](eval/faceted-causes-2026-11-20.md)).
- **Areas on the same models.** 6,509 of 7,883 stored areas agree with the
  section cut from the geometry (82.6%), all 1,667 wall GrossFootprintAreas
  among them; where they agree the median difference is 1e-15 relative or less
  on six of the eight models (1.3e-4 on HHS construction, whose stored areas
  are rounded). 1,100 of the 1,374
  disagreements have a named cause: 558 mullion "CrossSectionArea"s that are
  the mullion's length times a constant (a face area), 325 gross side areas
  with the openings out, 82 net footprints with the doors left in, 55 side
  areas measured on a face, 31 that match an equally wrong stored volume, 25
  unit slips (23 of them slab areas divided by the square-foot factor 10.764) and
  24 split-by-level pieces. In 607 the stored figure is the wrong one
  ([eval/areas-vs-stored-2026-11-19.md](eval/areas-vs-stored-2026-11-19.md)).
- **Faceted bodies, cut too (2026-11-20).** With meshes cut through their
  faces, 4,251 more stored areas get a pair (2,051 elements were skipped
  before; 5 still are) and 2,915 of them agree (68.6%): 9,424 of 12,134 in all.
  Stored areas on meshes miss more often, mostly on small pieces (1,051 of the
  1,225 new unexplained store under 0.6 m2); every stored volume is unchanged
  ([eval/areas-vs-stored-2026-11-20.md](eval/areas-vs-stored-2026-11-20.md)).
- **Why the faceted areas miss (2026-11-20).** Unexplained disagreements fell
  from 1,499 to 358 of 12,130 pairs: walls storing centre-line length x width
  or height (612), sloped or tapered slabs storing a face (on-a-face, now 409),
  stored zeros (96) and walls measured across another width (81). Faces written
  the wrong way round are turned back first. An independent ray-parity sampler
  agrees with 548 faceted sections to a median 0.002%
  ([eval/faceted-causes-2026-11-20.md](eval/faceted-causes-2026-11-20.md)).
  The sample model's areas are checked by hand in `engine.test.mjs` (a door
  out of a wall's side and footprint, a trapezoidal gable, the IPE 200 section).
- **Joined walls and copied host figures (2026-11-20).** Unexplained stored
  areas fell from 358 to 192 of 12,167 pairs. ArchiCAD's wall side area is a
  finishes figure: the mean of the two faces with the strips covered by
  T-joined walls taken off (37 pairs follow exactly from the
  `IfcRelConnectsPathElements` joins and the joined walls' widths; 18 more
  equal the mean of ArchiCAD's own two net face areas). skolebygg's 111
  mullions store their curtain wall's Revit Area and Length (138.4225 m2 and
  20,858 mm, digit for digit) on every piece; the bill of quantities uses their
  section instead
  ([eval/joins-and-host-figures-2026-11-20.md](eval/joins-and-host-figures-2026-11-20.md)).
- **Advanced breps (2026-11-20).** On kleine_Wohnung, 767 of its 775
  `IfcAdvancedBrep` are now read (faces on planes and cylinders): elements not
  read fell from 162 to 12, and net volume is computed for all 37 walls whose
  openings are advanced breps. All 39 new NetVolume pairs agree with the stored
  figure. Against IfcOpenShell, an independent kernel, 703 of the 767 breps agree
  within 0.1%. Each of the other 64 is a brep whose IfcOpenShell volume exceeds
  its own bounding box (35), a shell in overlapping pieces (27, noted on the
  element) or a shell that is not closed (2). Openings and booleans now subtract
  faceted shapes too, which unblocked 209 S_Office elements (182 agree with IfcOpenShell gross, 27 unexplained) and every net
  volume on skolebygg and duplex
  ([eval/advanced-breps-2026-11-20.md](eval/advanced-breps-2026-11-20.md)).
- **Revisions (2026-11-20).** `samples/make-revision.mjs` writes the
  sample's next issue with one change of each kind, worked by hand (a wider
  door: -0.084 m3; a thicker slab: +1.0 m3, resized; a beam moved 1 m; a
  column re-exported under a new GlobalId; a wall deleted; a column added),
  and `diff.test.mjs` checks each. On real files: three HHS Office pairs with
  a known edit (one renamed wall under a new GlobalId; a column given the
  slab's GlobalId, a duplicate; a full re-serialisation of 3,964 elements)
  give exactly that edit and no other. On five Revit exports of one house
  (OpeningDesign's Aalseth Residence, 2019, CC BY-SA, not committed), a
  GlobalId-only comparison lists 190 element records as added or removed that
  are the same element: six doors, a window and a wall get new GlobalIds in
  every export, and floors, roofs and walls switch between a host and its
  parts in three of four steps; this report pairs them, and the stair the last
  commit rebuilt shows as its flights, landing and stringers resized
  ([eval/revision-diff-2026-11-20.md](eval/revision-diff-2026-11-20.md)).
- **Seeded faults.** Flipping the half-space side, switching off the unit-slip
  rule, swapping the exit and entry points of a mesh cut, or adding a brep's
  void instead of subtracting it each fails a test.

**Spec sources.** IFC4 ADD2 TC1 and IFC2X3 TC1 (buildingSMART International)
for the entities, attribute order, `AgreementFlag` and profile definitions;
the EU/ArcelorMittal IPE section table for the IPE 200 area. The person who
would sign this off is a quantity surveyor or cost estimator; it has not been
reviewed by one.

## Uniformat II elements

Group by `uniformat` (level 3, e.g. `B2010 Exterior Walls`), `uniformat2`
(`B20 Exterior Enclosure`) or `uniformat1` (`B Shell`), on the page or with
`--by`. Codes and titles are NISTIR 6389's (NIST, public domain), in
`uniformat.mjs`. An element takes the model's own Uniformat code when it has
one (a classification reference, or Revit's `Assembly Code`); otherwise a rule
reads its class with PredefinedType, IsExternal, the wall a door fills, the
assembly it belongs to (a part of a curtain wall, stair, ramp or roof takes
that element's code, except a door, which stays a door, and a covering, which
is a roof covering in a roof and a stair finish on a stair), its storey's elevation and, for proxies and generic
terminals, its family name. A rule that cannot tell level 3 stops at the level
it can, or the element
goes to `(no Uniformat element)`; the element CSV says which code, source and
reason each element got.

On 17 public models (33,893 elements): 588 carry their author's code, the rules
code 28,086 more and leave 5,219 uncoded. Against the 588 authors' codes the
rules agree on 525 at level 1 and 482 at level 3; on dental_clinic, held out
while the rules were written, 66 of 69. Walls, slabs and frames carry no
author's code in any of the models, so those rules are not checked against
one. Details: [eval/uniformat-2026-11-20.md](eval/uniformat-2026-11-20.md).

Beams, columns and members are placed by what they carry, read from the
element boxes: the nearest slab or roof over the middle of the member that
comes down to within 0.6 m of its top. Under the roof is B1020 Roof
Construction, under a floor B1010 Floor Construction, and a beam under a slab
on grade, or a beam bearing on a foundation storey under the ground floor, is
A1010 (a grade beam). With nothing over it, or no geometry read, a member
stays at `B10 Superstructure (not told further)`. Curtain panels go with the
curtain wall (B2010) and stair stringers with the stair (C2010). On the 17
models this took level-3 coverage from 19,767 to 22,546 elements with the
authors' codes matched as before (482 of 588); 1,168 frame members were
placed, 3,128 stay at B10 (2,191 of them in one steel model with no slabs).
A fallback reading a storey named "Roof" was tried and dropped: it misplaced
the only frame members an author coded. Details:
[eval/frames-2026-11-20.md](eval/frames-2026-11-20.md).

**Exterior wall or partition, from the geometry** (`envelope.mjs`). A wall
with no `IsExternal` flag is placed by its geometry: every wall, curtain wall
and upright facade piece is read in plan as a rectangle, and rays cast from
nine points along each face of the wall either cross another one or leave the
building. A wall with one face open at five or more points is exterior; an
inner leaf or lining reads with the wall it stands against, and its row says
so. A flag a model gives every wall alike, while the geometry reads a fifth or
more of them the other way, is set aside (HHS Office's architect model and
advanced_model flag all their walls exterior, toilet partitions included).
Any other flag is kept, and where the geometry disagrees the element's reason
says "check it". On the 17 models the 268 unflagged walls now get a code
(uncoded elements 5,219 to 4,951), and on the walls that carry a flag, flag
and geometry agree on 3,534 of 4,564; where they disagree, the wall type's own
name sides with the geometry 228 times and with the flag 213 times. Details:
[eval/envelope-2026-11-20.md](eval/envelope-2026-11-20.md).

## Geometry it reads

Extruded area solids (rectangle, rounded and hollow rectangle, circle and hollow
circle, ellipse, I, L, T, U, C and Z shapes with root radii, arbitrary outlines
from polylines, indexed poly curves with arcs, composite and trimmed curves,
derived/mirrored and composite profiles); half-space, boxed half-space and
polygonal-bounded half-space clips; boolean difference, union and intersection;
mapped items with uniform and non-uniform scale; faceted breps (with voids),
closed shell and face-based surface models, polygonal and triangulated face
sets; advanced breps whose faces lie on planes and cylinders (edges on lines,
circles, ellipses and B-spline curves); swept disks (Pappus); revolved areas
(Pappus); blocks, cylinders, cones and spheres.

**How:** every solid becomes a signed sum of convex polyhedra. A concave
outline is fanned into signed triangles, voids enter with a minus sign, a half
space clips every piece, and anything subtracted (an opening, a bounded cut) is
intersected with every piece and enters with the opposite sign. Volumes come
from the divergence theorem over each piece's faces. A faceted body keeps its
faces, turned first so neighbours run each shared edge in opposite directions
(the loops of a face with a hole turn together; each separate piece of a shell
is turned outward by itself; a shell that is not closed gets no section).
When an opening or a boolean needs it, a closed faceted shell is taken as
polyhedra: one if it is convex, otherwise signed tetrahedra (each face fanned
and coned to the shell's centre), which add up to the shell exactly. An
advanced brep's edges are sampled once (arcs at 360 segments to the turn) and
its cylindrical faces cut into triangles that join points of nearly the same
angle, so it becomes a faceted shell. A plane
cuts it by summing, over its faces fanned into triangles, the edge each
triangle leaves in the plane (`shellSection`): concave faces, holes and voids
need no special case.

**Not read:** advanced brep faces on other surfaces (surfaces of revolution,
B-spline surfaces), open shells, tapered extrusions, swept
solids along curves other than disks, centre-line profiles, sloped flanges.
Overlapping openings in one element are taken out once (each opening is
subtracted from the body less the ones before it, so their overlap is added
back; `measure.test.mjs`). The overlapping pieces of one shell are counted
twice (the element carries a note). A faceted body
clipped by a half-space, or mixed with a swept disk, revolved area or CSG
primitive, is not cut: it keeps the stored area. A faceted shell of more than
4,000 tetrahedra has no openings taken out ("net not computed"). A faceted covering is cut
normal to its up direction, a rule fitted on one model.
A curved wall's side area is the section of its thinnest flat direction, not
its developed length.

## Run it

```
node cli.mjs model.ifc                         # BoQ by class and type, CSV to stdout
node cli.mjs model.ifc --by storey,class       # other groupings
node cli.mjs model.ifc --by uniformat2,uniformat   # elemental estimate (Uniformat II group, element)
node cli.mjs model.ifc --rows elements.csv     # every element
node cli.mjs model.ifc --check                 # stored vs computed summary
node cli.mjs model.ifc --voids-up-to 0.5,0.05  # leave in openings up to 0.5 m2 (areas) / 0.05 m3 (volumes)
node cli.mjs new.ifc --compare old.ifc         # change in the BoQ since old.ifc, CSV to stdout
node cli.mjs new.ifc --compare old.ifc --changes changes.csv   # and every changed element
node --test                                    # tests
node eval/stored-vs-computed.mjs a.ifc b.ifc   # the corpus check, volumes
node eval/areas-vs-stored.mjs a.ifc b.ifc      # the corpus check, areas
node eval/measure-rules.mjs a.ifc b.ifc         # what a small-void rule changes, and opening areas vs stored width x height
node eval/revision-diff.mjs r1.ifc r2.ifc r3.ifc   # the change report on consecutive revisions
node eval/uniformat-check.mjs a.ifc b.ifc      # Uniformat coverage, and the rules against authors' codes
node eval/envelope-check.mjs a.ifc b.ifc --svg plans/   # the envelope test against authors' IsExternal flags, with plans
```

Node 20+, no dependencies. To host your own copy, serve this directory as
static files (any static host); there is no server and no key.

`step.mjs` is copied from `../ids-model-check/step.mjs` so this directory
runs on its own.

## Privacy and usage counts

The page counts, in your own browser's storage only, how often a model is
taken off and a CSV downloaded (`usage.mjs`); nothing is sent anywhere. Tick
"Don't count my usage" to turn it off. Do Not Track and Global Privacy Control
are honoured.

## Disclaimer

Provided free and as-is, without warranty of any kind. The quantities are read
and computed from the file you provide; they are not a measured survey, a cost
estimate, a design review or professional advice, and they do not replace a
quantity surveyor or estimator. Check every quantity against the drawings and
your method of measurement before relying on it. IFC is a buildingSMART
International standard; this tool is not endorsed by buildingSMART or any
software vendor.

## License

MIT, see [LICENSE](LICENSE). Support the work: https://github.com/sponsors/Duncan-Haywood
