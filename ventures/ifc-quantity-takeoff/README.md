# IFC Quantity Takeoff

A bill of quantities from an IFC building model, in the browser or on the
command line, with every element's volume recomputed from its geometry and
checked against the quantities the authoring tool stored.

**Live tool:** https://marisstella.app/ifc-quantity-takeoff/

Drop an `.ifc` (IFC2X3, IFC4 or IFC4X3). You get:

- **A bill of quantities** grouped by class, type, storey, material or
  classification code: count, volume (m3), area (m2), length (m) and weight
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

Nothing is uploaded: the model is read in the browser tab.

## Why use it

| Today | What it costs | What this does differently |
|---|---|---|
| Revit or ArchiCAD schedules | the authoring tool and the native model | works on the IFC anyone downstream receives |
| CostX, Cubit, Autodesk Takeoff, Bluebeam 3D, Solibri ITO | a seat licence, a desktop install | free, a browser tab; does far less (no 2D takeoff, rate libraries or change comparison) |
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
  computed volume agrees with the stored GrossVolume for 4,805 of 5,495
  elements and with NetVolume for 6,133 of 6,366; where they agree, the median
  difference is 8e-16. Every disagreement is classified in
  [eval/stored-vs-computed-2026-11-19.md](eval/stored-vs-computed-2026-11-19.md),
  with the raw output beside it.
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
  The sample model's areas are checked by hand in `engine.test.mjs` (a door
  out of a wall's side and footprint, a trapezoidal gable, the IPE 200 section).
- **Seeded faults.** Flipping the half-space side, switching off the unit-slip
  rule, swapping the exit and entry points of a mesh cut, or adding a brep's
  void instead of subtracting it each fails a test.

**Spec sources.** IFC4 ADD2 TC1 and IFC2X3 TC1 (buildingSMART International)
for the entities, attribute order, `AgreementFlag` and profile definitions;
the EU/ArcelorMittal IPE section table for the IPE 200 area. The person who
would sign this off is a quantity surveyor or cost estimator; it has not been
reviewed by one.

## Geometry it reads

Extruded area solids (rectangle, rounded and hollow rectangle, circle and hollow
circle, ellipse, I, L, T, U, C and Z shapes with root radii, arbitrary outlines
from polylines, indexed poly curves with arcs, composite and trimmed curves,
derived/mirrored and composite profiles); half-space, boxed half-space and
polygonal-bounded half-space clips; boolean difference, union and intersection;
mapped items with uniform and non-uniform scale; faceted breps (with voids),
closed shell and face-based surface models, polygonal and triangulated face
sets; swept disks (Pappus); revolved areas (Pappus); blocks, cylinders, cones
and spheres.

**How:** every solid becomes a signed sum of convex polyhedra. A concave
outline is fanned into signed triangles, voids enter with a minus sign, a half
space clips every piece, and anything subtracted (an opening, a bounded cut) is
intersected with every piece and enters with the opposite sign. Volumes come
from the divergence theorem over each piece's faces. Faceted bodies give a
volume but cannot have openings subtracted; such elements report "net not
computed" rather than a guess. A faceted body keeps its faces, and a plane
cuts it by summing, over its faces fanned into triangles, the edge each
triangle leaves in the plane (`shellSection`): concave faces, holes and voids
need no special case.

**Not read:** advanced breps (NURBS), open shells, tapered extrusions, swept
solids along curves other than disks, centre-line profiles, sloped flanges.
Overlapping openings in one element are subtracted twice. A faceted body
clipped by a half-space, or mixed with a swept disk, revolved area or CSG
primitive, is not cut: it keeps the stored area. A faceted covering is cut
normal to its up direction, a rule fitted on one model.
A curved wall's side area is the section of its thinnest flat direction, not
its developed length.

## Run it

```
node cli.mjs model.ifc                         # BoQ by class and type, CSV to stdout
node cli.mjs model.ifc --by storey,class       # other groupings
node cli.mjs model.ifc --rows elements.csv     # every element
node cli.mjs model.ifc --check                 # stored vs computed summary
node --test                                    # tests
node eval/stored-vs-computed.mjs a.ifc b.ifc   # the corpus check, volumes
node eval/areas-vs-stored.mjs a.ifc b.ifc      # the corpus check, areas
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
