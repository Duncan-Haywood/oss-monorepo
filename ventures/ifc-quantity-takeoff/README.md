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
- **A room schedule.** Every room (IfcSpace) measured from its own solid:
  floor area and perimeter cut 1 cm above its floor, height, wall area
  (perimeter x height, before doors and windows), volume, each checked
  against the room's stored quantities with the cause of a disagreement named.
  Rooms exported only as a plan outline and a box (schependomlaan: 94 of 100)
  are measured from those. Furniture, fittings and finishes the model does not
  place in a room are placed by where they stand; group the bill of
  quantities by room (`--by space,class`). See "Rooms" below.
- **Every element** as CSV: GlobalId, class, name, type, storey, room, material,
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
  that contradicts the element's own stored length, height and width (for a
  beam, column or member, its stored length x cross-section area; 2026-11-22,
  [eval/member-length-section-2026-11-22.md](eval/member-length-section-2026-11-22.md):
  no public model has the fault, the sample office's IPE 200 does). Where the
  stored figure is the wrong one, the bill of quantities uses the computed one.

**Guides** (2026-11-22, worked examples on the sample office, every number
checked against the engine by `guides.test.mjs`):
[a bill of quantities from an IFC model](how-to-get-a-bill-of-quantities-from-an-ifc-model.html),
[checking stored quantities before pricing](how-to-check-ifc-quantities-before-pricing.html),
[comparing two revisions for a change order](how-to-compare-two-ifc-revisions-for-a-change-order.html).

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
  claims no standard's rules. **Per work section**, too: walls, slabs and
  roofs, coverings, and beams, columns and members can each have their own
  pair (the "By work section" preset judges walls and finishes by area and
  slabs and frames by volume; on the command line
  `--voids-up-to "0.5,0.05;slabs=0,0.05;coverings=0.5,0"`). On 4 of 11 public
  models a single pair also adjusted slab areas or covering volumes that a
  per-section rule leaves alone, by up to 7.2 m2 of slab area in one
  ([eval/measure-sections-2026-11-20.md](eval/measure-sections-2026-11-20.md)).
- **What changed since the last issue.** Drop the earlier revision too and
  get the change on every bill-of-quantities line (priced with the same
  rates, for a change order) and every element added, removed, changed (a
  quantity or attribute), moved or resized, as CSV (`diff.mjs`). Elements are
  matched by GlobalId, then by Tag (Revit's ElementId, which survives an
  export that renews GlobalIds), then by place and volume; Revit parts in one
  issue and their host in the other are paired, not counted as removed and
  added ([eval/revision-diff-2026-11-20.md](eval/revision-diff-2026-11-20.md)).
  An element deleted and placed again (new GlobalId and new Tag) where the
  old one stood, as the same type or another, is listed as **replaced in
  place** with its type, size and move, not as one removed and one added
  (same class and storey, boxes overlapping by half their union, volumes
  within a quarter, one candidate each way; on a 2-day step of a real Revit
  house, 22 of the 25 window records the report had listed as removed or added were 11
  windows re-placed or swapped for another type;
  [eval/replaced-in-place-2026-11-22.md](eval/replaced-in-place-2026-11-22.md)).
  A storey renamed in place (same GlobalId) is listed once as **storey
  renamed**, not as a storey change on every element on it; a type renamed
  under one GlobalId is listed too but stays a type change, because Revit
  keeps a type's GlobalId when it is re-specified (glulam "5.125x6" to steel
  "HSS3.500X0.203" on Lake Kegonsa). On a BlenderBIM series of a real house
  (Tulpstraat, 12 commits, 2024), the step that renamed "My Storey" had
  listed all 28 matched elements as changed; now 24, with 4 unchanged
  ([eval/revision-diff-tulpstraat-2026-11-23.md](eval/revision-diff-tulpstraat-2026-11-23.md)).
  A material has no GlobalId, so the report groups every material change
  by **material swap** (before -> after, with the elements' count, classes,
  volume and area): one line to price per re-specification, not one per
  element. When the two files keep their STEP ids (a tool that edits the
  file in place, such as BlenderBIM: at least 3 elements matched by
  GlobalId and 80% of them keeping their own id), an IfcMaterial or a
  layer, profile or constituent set whose name changed under one id is
  listed as **material renamed**, and each element changed only by that is
  marked "same material entity, renamed"; like a type, it stays a change.
  A re-export renumbers the file (Revit, Aalseth: 0 to 2% of matched
  elements keep their id), so no rename is claimed there. On Tulpstraat
  the 17 walls and slab listed as "Unknown -> brick/baksteen" were one
  material and one layer set renamed, no element re-assigned; on Aalseth's
  last step 30 material changes read as 14 swap lines
  ([eval/revision-diff-materials-2026-11-23.md](eval/revision-diff-materials-2026-11-23.md)).
- **Faulty units repaired, and said so.** A unit named INCH, FOOT, SQUARE
  FOOT and so on whose declared factor is not that unit (a 2014 Revit export
  declares its inch as 3.6576 m, 144 inches, which makes every volume 3
  million times too big) is read at the exact value, and the page says which
  unit it repaired ([eval/units-repair-2026-11-20.md](eval/units-repair-2026-11-20.md)).

- **See what was measured.** A 3D view (WebGL, no library) draws every
  element from the solid its volume was computed from, openings cut, and
  colours it by whether its stored quantities agree with the geometry, by
  class or by storey. Click a bill-of-quantities line or a check to show its
  elements; click an element for its stored and computed figures. On 11
  public models the drawn triangles enclose the computed volume within 0.5%
  for 9,310 of 9,312 elements checked
  ([eval/model-view-2026-11-21.md](eval/model-view-2026-11-21.md)). Tracing
  the first version's 130 misses found the takeoff, not the picture, wrong
  on 128: a body's overlapping items were summed, so a kitchen cabinet
  counted 1.8 times its own box. They are now joined
  ([eval/item-union-2026-11-21.md](eval/item-union-2026-11-21.md)).
  Extruded profiles are drawn from outlines thinned to within 0.05% of
  their size and scaled back to their own area (the quantities keep the
  full 360-to-the-turn arcs): the Tekla Mini Project went from 1.82 million
  triangles to 416 thousand, about 115 MB to 26 MB of GPU memory, with the
  same volume check
  ([eval/display-thinning-2026-11-21.md](eval/display-thinning-2026-11-21.md)).
  Storeys can be shown or hidden one at a time, and a section plane cuts
  the model: a plan cut (starting 1.2 m above the floor of what is shown,
  where a floor plan is drawn) or a vertical cut across x or y. Cut solids
  show their inside faces in grey, as a cut is drawn on a section, and
  clicking picks only what is left standing. Building the storey list found
  elements placed in rooms (`IfcSpace`) listed under the room's number as
  their storey, in the view and in the bill of quantities grouped by
  storey: ARK_NUS's 5 floors showed as 198. They now count on the storey
  above their room (1,268 ARK_NUS elements, 37 in kleine_Wohnung)
  ([eval/storeys-and-sections-2026-11-21.md](eval/storeys-and-sections-2026-11-21.md)).
  The takeoff and the meshing both run in a Web Worker
  (`view-worker.mjs`), and the GPU buffers grow by appending, so the page
  keeps answering while a big model reads and draws. The worker posts the
  takeoff's rows back without their solids (they are non-enumerable, so
  structured cloning leaves them out: 6 MB and 27 ms on the 56 MB school
  model) and keeps the solids to mesh. On that model the longest freeze
  while reading went from 11.7 s to 0.7 s, and the view is drawn 35 s after
  the drop instead of 47 s, since the model is no longer taken off twice
  ([eval/takeoff-worker-2026-11-21.md](eval/takeoff-worker-2026-11-21.md));
  stalls over 100 ms while drawing went from 59 to 4
  ([eval/view-worker-2026-11-21.md](eval/view-worker-2026-11-21.md)).
  Without workers the page does both itself, as before.

Nothing is uploaded: the model is read in the browser tab.

## Why use it

| Today | What it costs | What this does differently |
|---|---|---|
| Revit or ArchiCAD schedules | the authoring tool and the native model | works on the IFC anyone downstream receives |
| CostX, Cubit, Autodesk Takeoff, Bluebeam 3D, Solibri ITO | a seat licence, a desktop install | free, a browser tab; does far less (no 2D takeoff or rate libraries); its revision comparison names elements that only look new |
| Free IFC viewers (BIMcollab Zoom, BIMvision, xeokit) | free | show stored properties one element at a time; no grouped, priced BoQ, no check of the stored figures |
| IfcOpenShell scripts | free | needs Python and a programmer |

The one thing none of them advertises: on 8 public models, 632 of 5,495 stored
GrossVolumes (11.5%) disagree with the element's own geometry, the tool names
a cause for 598 of them, and in 166 the stored figure is provably the wrong
one (on one school model, 20 roof slabs store 125,036 m3 where their geometry
holds 1,346). An estimate that sums stored quantities inherits those errors;
this tool says which they are
([eval/stored-vs-computed-2026-11-21.md](eval/stored-vs-computed-2026-11-21.md)).

## How it was checked

- **Hand calculations.** `samples/sample-office.ifc` is written by
  `samples/make-sample.mjs` so every volume can be worked by hand: a wall with
  a door opening (3.0 m3 gross, 2.58 net), a wall cut by a sloped plane (2.0),
  a wall split by level storing the whole wall's 3.6 m3 on each 1.8 m3 piece, a
  slab, a round column (pi x 0.15^2 x 3 m3) and an IPE 200 beam. `engine.test.mjs`
  checks each against the arithmetic, and the IPE 200 section against the steel
  tables (28.48 cm2; root radii included as (4 - pi) r^2).
- **Real models.** On the 8 public models that store volumes (Revit, ArchiCAD, Tekla and others), the
  computed volume agrees with the stored GrossVolume for 4,863 of 5,495
  elements and with NetVolume for 6,172 of 6,405; where they agree, the median
  difference is 8e-16. Every disagreement is classified in
  [eval/stored-vs-computed-2026-11-19.md](eval/stored-vs-computed-2026-11-19.md)
  and, after two causes named 2026-11-21 (unexplained GrossVolumes 159 to 34),
  [eval/stored-vs-computed-2026-11-21.md](eval/stored-vs-computed-2026-11-21.md),
  with the raw output beside it (rerun 2026-11-20: 58 Revit members whose
  faceted faces were written reversed now agree,
  [eval/faceted-causes-2026-11-20.md](eval/faceted-causes-2026-11-20.md)).
- **Member length and steel weight (2026-11-22).** On 30 public models,
  4,952 of 10,035 columns, beams, members and piles store no Length, so a
  per-metre rate priced them at 0. 4,948 now get the body's extent along
  its extrusion. Where a Length is stored, the body agrees with 4,153 of
  5,083 within 2% (all 1,649 in HHS Office). 603 ARK_NUS_skolebygg mullions
  store their curtain wall's length instead of their own: 5,480 m against
  794.6 m of actual mullion. That is named host-figure, and the BoQ sums the
  body. Plain-steel members with no stored weight get volume x 7,850 kg/m3
  (512 members). Where a steel exporter stores a weight, that figure agrees
  with it for 230 of 233
  ([eval/member-length-weight-2026-11-22.md](eval/member-length-weight-2026-11-22.md)).
- **Why NetVolumes miss (2026-11-21).** Unexplained NetVolumes fell from 233
  to 83 of 6,405: 120 Tekla steel parts store volume (and weight) from the
  section without its root fillets or with round tubes as 8- or 16-sided
  polygons, 2 to 11% under the profile's real area (the file's own
  CrossSectionArea agrees with the geometry); 23 Revit stair stringers each
  carry the whole stair's volume (flights + landings + stringers, to five
  decimals); 7 skylights store 0. The BoQ sums the geometry for all three and
  scales Tekla's stored weights to it; skolebygg's member volume drops from
  18.16 to 11.52 m3
  ([eval/netvolume-causes-2026-11-21.md](eval/netvolume-causes-2026-11-21.md)).
  Then 83 to 6: 77 of schependomlaan's 81 ArchiCAD windows and doors store
  "Net Volume" (and the same figure as "W/D Opening Volume") as the frame and
  sash only, the body less its glass panes to 0.02% (`glazing-left-out`;
  panes are the items drawn in a see-through or glass-named style, glass
  wool excluded). The BoQ sums the whole body: windows 8.46 to 10.26 m3,
  doors 15.55 to 16.39 m3 on that model
  ([eval/glazing-left-out-2026-11-21.md](eval/glazing-left-out-2026-11-21.md)).
  Then 6 to 2 (2026-11-22): the four "D2R 2zl 18" doors with two side
  lights store the body less the side lights' glass only, the leaf's glass
  counted (4 of 4 to 0.02%). The rule groups panes by the plane they sit in
  and tries the body less one plane's glass, never every subset. The 2 left
  are zinc copings whose stored section is 3.6% over the profile exported
  ([eval/side-lights-2026-11-22.md](eval/side-lights-2026-11-22.md)).
  Then 2026-11-23 (`polygon-section`): ArchiCAD's own Net Volume of a
  profiled element is its section with every arc drawn as 45-degree chords
  (6 steel angles and 3 sills, to seven digits), and its round columns are
  circumscribed 20-gons (C20's D200, volume and perimeter to ten digits).
  These were inside the 2% already (0.07% to 0.8%); 19 pairs on 11 elements
  now carry the cause and the BoQ sums the true arcs. The 2 copings are not
  this (chords move them further away) and stay unexplained
  ([eval/archicad-polygon-sections-2026-11-23.md](eval/archicad-polygon-sections-2026-11-23.md)).
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
- **Ends cut square in the swept check (2026-11-23).** A stepped arc wall
  whose ends are cut square to the plan axes, not along a radius, was refused
  and kept the chord cut. Its faces were right, but the divergence-theorem
  check left out the ends' own flux, and an end at x = 0.6 on a quarter ring
  carries area x -0.3 of it. The check now adds the flux of the standing
  planes that face no centre (`ends`, exact for a plane). On the constructed
  quarter ring with both ends cut, the check closes to 1e-9 and the outer and
  inner faces match hand-clipped chords to 1e-9. As a file of two drawn
  outline items, the wall is measured on its facets. A top raked by a sloped
  cut still misses by 9.8% and is refused. The 28 public engine_web-ifc models
  are unchanged line for line; none has such a wall
  ([eval/square-cut-ends-2026-11-23.md](eval/square-cut-ends-2026-11-23.md)).
- **The swept check on signed fans (2026-11-23).** A curved wall whose
  section steps up its height is measured on its facets only when its two
  faces enclose its volume (the swept check). That check had been kept off any
  body with negative terms, which every drawn outline that is not convex has:
  the engine splits it into a signed fan of triangles. Run on stepped quarter
  and half rings drawn as two outline items (42 to 356 negative terms, fans
  started on either arc) and on a recess cut by a boolean difference, the
  faces come out as the hand chords to 1e-9 and enclose the volume to 1e-14;
  ends cut square still miss by 28% and are refused. The guard is lifted. On
  the 28 public engine_web-ifc models nothing moved: 45 real walls with
  negative terms already passed the one-section check, and every refused
  curved wall fails earlier, its facets facing no one centre. No public model
  has a stepped arc wall drawn as outlines to try it on
  ([eval/signed-fan-swept-2026-11-23.md](eval/signed-fan-swept-2026-11-23.md)).
- **Half-round walls and the openings cut at both ends (2026-11-23).**
  ISSUE_129's two 180-degree tunnel walls (#36735, #148665), refused until now,
  are measured. The earlier note put the wrong outer face down to "cutter
  faces". Traced, the cause was simpler: a half ring's two ends lie on one
  plane through the centre, and summing that plane as one patch put its
  centroid on the centre itself, so 5.58 m2 of ends read as outer face. The
  cuts of the two openings, one at each end, do the same on two shared planes.
  A plane now counts toward a face only when its area lies round the foot of
  the perpendicular from the centre (RMS within 45 degrees). Both walls match
  their own axis circle to 0.003% (98.362 / 89.597 m2 against 98.360 / 89.595;
  244.319 / 222.548 against 244.312 / 222.542; 1.7999 m wide, type 1800), and
  the net faces enclose the net volume to 0.01%. On four public models nothing
  else moved; the bill's side area on these two goes from 22.83 m2 of chord
  cuts to 327.41 m2 gross, 285.42 m2 net
  ([eval/half-round-ends-2026-11-23.md](eval/half-round-ends-2026-11-23.md)).
- **Curved walls as triangulated breps, and a duct inside one (2026-11-23).**
  Faceted brep walls on an arc are now measured too. Facets leaning up to 2
  degrees count as standing, and a facet with more of the wall beyond it (a
  ray test) lines a channel, so it is on neither face. ARK_NUS's two refused
  walls have a 0.25 x 0.75 m ventilation duct along their foot. They now read
  14.336 / 11.699 m2 against 14.333 / 11.699 from their own axis circle, and
  0.4225 m wide against a stored 0.423. They pass a second volume check, the
  divergence theorem in plan, which holds for a wall of any section. Eight
  tunnel walls in ISSUE_129 pass the original check. On four public models
  65 of 134 flagged walls are measured (55 before), and none of the earlier 55
  moved; the bill gains 265 m2 of side area on the ten that store nothing
  ([eval/triangulated-arc-breps-2026-11-23.md](eval/triangulated-arc-breps-2026-11-23.md)).
- **A curved wall's side area, measured on its facets (2026-11-23).** A wall
  built on an arc is now measured on its own facets: its outer and inner
  faces, their mean as its side area (the centre line's, for a wall of one
  height), and its radial width. The plane cut it used before gave a chord's
  elevation. Checked against the files' own circles on three walls
  (dental_clinic #1674: outer 4.4325, inner 4.4522 m2, width 0.1240 m, each
  matching the profile's radii and trim angles to the fourth digit) and against
  ARK_NUS's ten stored outer faces (within 0.001%). A measurement is kept only
  when mean face x width equals the body's volume within 2%: 55 of 134 flagged
  walls on four public models pass, and the refused ones (triangulated breps,
  straight walls with rounded ends) keep what they had. On the 45 measured
  walls that store nothing, the bill's side area goes from 434 to 1,330 m2
  (ISSUE_098 +645 m2, ISSUE_129 +243 m2), with no volume changed
  ([eval/curved-side-area-2026-11-23.md](eval/curved-side-area-2026-11-23.md)).
- **Holes added back, faces averaged, walls on an arc (2026-11-22).**
  Unexplained stored areas fell from 117 to 14 on the eight public models.
  ArchiCAD's slab GrossArea is the outline: its NetArea plus the file's own
  "Holes Surface Area" (14 of 14 schependomlaan slabs, to the last digit).
  Knee walls trimmed under a roof store the mean of their two faces as cut
  from the geometry (12 walls); coverings drawn with ArchiCAD's wall tool store
  centre length x thickness (20 pairs); a sill, three upstands and Mini
  Project's four corbels store one flat face of the body. ARK_NUS's 10
  remaining walls are built on a quarter circle and store their outer face,
  (Length + Width/2 x pi/2) x Height, to 0.000%; the engine now recognises a
  wall that bends in plan and says a plane cut cannot measure it. Only
  `unexplained` pairs changed and every stored figure is still the one summed
  ([eval/curved-and-faces-2026-11-22.md](eval/curved-and-faces-2026-11-22.md)).
- **Cross-sections: half a surface, and footings cut along their run
  (2026-11-20).** Unexplained stored areas fell from 192 to 117, and
  cross-sections from 77 to 2. HHS architect's 58 Revit mullions store half
  their body's total face area as CrossSectionArea (0.66 m2 on a 0.0095 m2
  post; #17161 to nine digits), a rule that names no other of 2,093 pairs.
  Faceted members are now cut normal to their prism axis, the direction their
  side faces run with the most area, not their longest end-face normal:
  schependomlaan's mitred strip footings were cut on a slant (7% over) and 13
  of 17 now agree; the other 5, stubs about as short as they are wide, store
  their own Width x Height
  ([eval/cross-sections-2026-11-20.md](eval/cross-sections-2026-11-20.md)).
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
  A second house (OpeningDesign's Lake Kegonsa Home, five Revit exports
  2014-09 to 2015-07, not committed): 138 GlobalId-only adds/removes are the
  same element (windows and doors renewed every export, as on Aalseth; walls
  and their parts). Its 2014-10-14 export declares 'INCH' as 3.6576 m; read
  at its word, all 420 and 568 matched elements of the two steps around it
  changed; with the inch repaired, 205 and 123 are unchanged and the median
  volume ratio of same-GlobalId elements is 1.0000 (254 of 402 and 331 of 549
  within 0.5%; eval/units-repair-2026-11-20.md).
- **Seeded faults.** Flipping the half-space side, switching off the unit-slip
  rule, swapping the exit and entry points of a mesh cut, or adding a brep's
  void instead of subtracting it each fails a test.

**Spec sources.** IFC4 ADD2 TC1 and IFC2X3 TC1 (buildingSMART International)
for the entities, attribute order, `AgreementFlag` and profile definitions;
the EU/ArcelorMittal IPE section table for the IPE 200 area. The person who
would sign this off is a quantity surveyor or cost estimator; it has not been
reviewed by one.

## Rooms

`rooms.mjs`; eval/rooms-2026-11-21.md. An estimator prices finishes and fit-out
room by room, so the takeoff lists every IfcSpace with:

- **Floor area and perimeter**, cut from the room's solid 1 cm above its lowest
  point (below any sloped ceiling). The perimeter is the outline of the room,
  not of the convex pieces it is cut into: edges two pieces share cancel, and
  a cut takes away the part of an edge it removes.
- **Height** (lowest to highest point), **wall area** as perimeter x height
  (gross wall finish), **volume**.
- **Net wall area** (eval/net-wall-finish-2026-11-21.md): the gross wall area
  less the doors, windows and curtain walls in the room's walls. A door or
  window comes off in every room the file's space boundaries
  (`IfcRelSpaceBoundary`) name for it; one they do not name is placed by
  testing a point either side of it, through the wall, against the room
  solids. One they name on one side only also takes the room that test finds
  on the other, when the test agrees with the file's side (2026-11-23,
  ids-model-check eval/door-extra-room-2026-11-23.md: dental_clinic bounds 18
  windows to the roof space outside alone; 17 rooms got their window or door
  back, nothing else changed in 25 files). It comes off at its stored OverallWidth x OverallHeight (Revit's
  boundary surface for a door is the frame's width swept to the room's
  height, 1.37 x the door on Office_A), a curtain wall at its boundary
  surface. Pieces of one window drawn as several IfcWindows are taken once.
  Held out against the files' boundaries, the geometric test found the same
  rooms for 791 of 857 openings and a room the file does not name for 19.
  Only the part of an opening inside the room's height band comes off
  (eval/opening-height-cut-2026-11-21.md): the stored height is read down
  from the opening's head, so a door frame set into the floor build-up is
  not cut, but ARK_NUS's 3.09 m classroom glazing over a 2.44 m lowered
  ceiling comes off at 2.44 m (151 deductions on 5 of 12 models cut,
  47.2 m2; the room schedule's CSV gives each room's cut area).
- A room with no body but a `FootPrint` outline and a `Box` (Revit and
  ArchiCAD both export these) is the outline extruded through the box.
- Each figure against the stored one (GrossFloorArea then NetFloorArea,
  GrossPerimeter, Height, NetVolume then GrossVolume), within 2%, with the
  cause of a disagreement: `unit-slip` (a power of ten: HouseZ's areas in mm2),
  `floor-x-height` (stored volume = floor x nominal height over a lowered
  ceiling, also in another unit: ARK_NUS writes litres), `outline-prism`
  (an outline-and-box room under a sloped ceiling holds less than the prism),
  `nominal` (a stated height over a ceiling the roof cuts lower).
- **Which room each element stands in.** The file's own containment first;
  then, for elements it puts in no room, the middle of the element's plan box
  10 cm above its bottom, at half height and 10 cm under its top, tested
  against each room's solid (convex pieces by their planes, faceted shells by
  winding number); a ceiling covering also just under itself (Revit rooms end
  at the ceiling's underside), a floor finish just over. Walls, doors, windows,
  slabs, frames, stairs and railings bound rooms and are not placed by
  geometry (on ARK_NUS, whose rooms run to wall centrelines, 901 walls and 306
  doors otherwise landed in one). The element CSV says which way (`Room from`).
  An element whose body gives no box (Revit sofas, grab bars and plumbing
  fixtures drawn as faceted surfaces read only as a volume) is tested at the
  point it was placed at instead, 10 cm above, 10 cm below, then on it
  (`row.spaceBy` = `placement point`): 133 of 139 such components land in
  the room the file names (2026-11-23,
  `../ids-model-check/eval/cobie-placement-point-2026-11-23.md`).
  Since the same day those bodies keep a box: a faceted shell that is not
  closed (Revit's surface-model fittings, a 0.1 mm vertex gap) still gives its
  points for the box and plan rectangle, never a section or area (from
  PR #18042); 362 more elements in 25 public files have a box, no volume,
  area or length changes. A box whose middle is in no room (a towel dispenser
  or fire extinguisher cabinet set into its wall) is sampled at 5 x 5 x 5
  points and goes to the room most fall in (`row.spaceBy` = `box sample`):
  37 of 37 such components land in the room the file names
  (`../ids-model-check/eval/cobie-wall-hosted-2026-11-23.md`).
  The inside test skips a convex piece with no volume (a flat sliver a room's
  solid can carry in a wall's plane: its middle lies on its own faces, so it
  used to take half of space as inside and empty the room). On 852 rooms in 12
  public files, a grid through each box now matches the room's volume within
  0.15 in every room, against 29 off before; components placed in the file's
  own room 1,117 to 1,218 of 1,227
  (`../ids-model-check/eval/cobie-flat-pieces-2026-11-23.md`).

13 public models, 991 rooms (989 measured): stored floor area agrees on 528 of
535, perimeter 472 of 475, height 501 of 535 (34 nominal), volume 213 of 535
(246 unit slips, 57 floor x nominal height in litres, 11 outline prisms, 8
unexplained). Elements placed by where they stand: 1,024 (coverings,
furniture, proxies) on top of 1,652 the files place themselves. Net of
doors, windows and curtain walls: 6,914 m2 and 352 m2 off 65,368 m2 of gross
wall in 989 rooms (1,330 deductions named by boundaries, 1,419 by geometry).

`node cli.mjs model.ifc --rooms rooms.csv`; page section "Rooms" (click a room
to show its elements; CSV download).

## Bar schedule

`rebar.mjs`; [eval/rebar-schedule-2026-11-22.md](eval/rebar-schedule-2026-11-22.md).
Rebar is ordered by bar mark, not by class and type, so every reinforcing bar
the model draws as a swept disk (or a round extrusion) goes into a bar bending
schedule: one line per member, bar mark, size, shape and cut length, with:

- **Number of bars**: each swept disk is a bar, so a Tekla bar group of 16
  mapped copies counts 16.
- **Cut length**: along the bar's centreline, bends included (the steel cut
  and bent; Tekla's weights use it).
- **Shape and leg dimensions**: the path is read as legs and bends (true
  arcs, or Allplan's bends drawn as eight facets, whose radius is the circle
  through their vertices). Each leg is measured out to out with the nominal
  size: straight run plus (r + d/2) tan(theta/2) at a bend up to 90 degrees,
  r + d/2 past it. A BS 8666 shape code only where read with certainty (00,
  11, 21); otherwise straight, L, U, Z (cranked), closed link or n bends.
- **Mass**: cut length times the nominal size's mass per metre
  (pi d^2/4 x 7,850 kg/m3). The nominal size is the file's own property
  (Tekla DIAMETER_NOMINAL, Size, Allplan Bewehrungsdurchmesser), else the
  IFC attribute. Tekla draws a 10 mm bar 10.625 mm across, which weighed
  as a disk would be 13% heavy; the BoQ's bar weights use this rule too.
- **The file's own figures beside ours**: mark, grade, shape code, bars in
  the group, length and group weight (Tekla Rebar_properties, Tekla
  Reinforcement - Bending List, Allplan_ReinforcingBar, the ISO/BS/DIN
  bending property sets). Bars with no mark get A01, A02... per distinct bar,
  marked as assigned. Notes: a bend tighter than BS 8666's minimum scheduling
  radius, a bend drawn as a sharp corner, a bar drawn at another size than
  its nominal one, and bar elements that could not be read.

On 12 public exports (Tekla, Allplan, Revit, FreeCAD, buildingSMART), 265 of
310 bar elements are read (main read 35, buildingSMART's two samples; every
Tekla, Allplan and Revit bar has a StartParam and EndParam, which it
refused). Against the authors' own figures: bars per Tekla group 32 of 32,
per Allplan position 24 of 24, Tekla group weight within 1% 32 of 32,
Allplan mass per metre 20 of 20, bending diameter 13 of 13, length 37 of 37,
leg dimensions within 2 mm 30 of 33 (the misses are hook legs, measured
differently). CLI `--rebar bars.csv`; page section "Bar schedule".

**Hooks (2026-11-23, [eval/rebar-hooks-2026-11-23.md](eval/rebar-hooks-2026-11-23.md)).**
Each end hook gets its angle and tail (the straight run past the bend, what a
bending machine is set to) in the CSV and on the page. A hook is an end bend
past 90 degrees on a short end leg, or an end the file names (Tekla
HOOK_START_ANGLE / HOOK_END_ANGLE, the ISO/BS bending sets'
BendingStartHook / EndHook). The file's two ends are matched to the drawn
ends either way round, because Tekla's start is sometimes the drawn end. On
four Tekla and Revit exports, 45 of 45 named hook angles agree with the bend
drawn there (42 before the either-way match). A tail under ACI 318's
minimum for a 180 degree hook (the larger of 4d and 65 mm) or a 135 degree
stirrup hook (6d) is noted. Tekla's E = 64 mm on a 135 degree hook isn't the
tail (48 mm), but it is what Tekla's DIM_L sums (A+B+C+D+2E = 1,688, so
1,680). Revit's hook A is 4.5 in whatever the bar.

**Bars in the 3D view (2026-11-23, [eval/bar-tubes-2026-11-23.md](eval/bar-tubes-2026-11-23.md)).**
A swept disk has no faces, so bars used to be invisible in the view and had
no box. They are now drawn as polygon tubes along the same path the
schedule reads (mitred at bends, capped, 8 sides, fewer when a model's bars
would pass 600,000 triangles) and boxed by the path widened by the bar.
buildingSMART's bar samples: bar boxes within 2 mm of IfcOpenShell 0 of 35 to
35 of 35. Seven Tekla exports: 753 bar elements drawn, none before.

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

**Slabs that are not floors** (`slabRole`, `findRoofDecks`). Modellers use
the floor tool for flat roofs, finishes and fins, so a slab typed FLOOR is
read by its type name first: finish floors ("FB 15.0 - Teppich", "Finish
Floor - Ceramic Tile", screeds, tiles) go to C3020 Floor Finishes (C2020 on a
stair), sun-shade fins to B2010, and names saying roof ("plat dak", "dakvloer",
"Flachdach") to B1020; a name that also names the structure ("Betongdekke 300
+ avretting og flis") stays a floor. Otherwise a slab is the roof when nothing
lies over it, walls or columns stop under it and no storey's walls stand on it
(not decided in a model whose roof geometry was not read). The frame under a
roof slab follows it to B1020. On the 17 models, 600 B1010 slabs became 270
floors, 251 finishes, 25 stair finishes, 36 sun shades and 18 more roofs
(HHS Office's 3,537 m² roof deck, FM_ARC's 1,255 m², schependomlaan's flat
roofs); 114 columns and 28 beams moved from B1010 to B1020, and the authors'
codes match as before. Details:
[eval/slab-roles-2026-11-20.md](eval/slab-roles-2026-11-20.md).

**Slabs on grade, gutters, downspouts and outside railings**
(`findGroundSlabs`, `rainwaterRole`). A slab named as on grade ("127mm Slab
on Grade", Bodenplatte, grondplaat) is A1030 Slab on Grade, and so is one
that by geometry lies at the bottom of the model (within 0.5 m of the lowest
slab or wall) with nothing under it and no beam or column carrying it; a
slab on grade with no slab or roof over it, or named exterior, is a patio or
walk, G2030. Gutters and downpipes (PredefinedType GUTTER, or named gutter,
takrenne, Dachrinne, downspout, hwa) and box-gutter framing go to B3010 Roof
Coverings, and railings flagged IsExternal to B2010 (balcony walls and
handrails). On the 17 models 164 codes changed: 10 slabs to A1030 (HHS
Office's 3,518 m² ground slab in two models, duplex, HouseZ), 2 to G2030, 75
gutters, downpipes and gutter framing to B3010, 77 railings to B2010; the
authors' codes match as before. Details:
[eval/slab-on-grade-2026-11-20.md](eval/slab-on-grade-2026-11-20.md).

**Railings by what they stand on** (`findStairRailings`,
`assignRailingSides`). A railing beside a stair, flight, ramp, landing or
stringer (within 0.3 m in plan, starting between its bottom and top) is
C2010 Stair Construction, and so is one rising 3 m or more with no stair
found, and any railing piece joined to one of those; then the IsExternal flag
true is B2010; then the envelope test's rays, cast from both faces of the
railing, put it outside (B2010, a balcony or roof guard) or inside (C1010, an
interior balustrade). On 16 models coded railings went from 77 to 461 of
486: 343 stair, 95 exterior, 23 interior; the 25 left are railings whose
geometry is not read or a structural model with no doors. Details:
[eval/railings-2026-11-20.md](eval/railings-2026-11-20.md).

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

Sloped roofs block the rays too (2026-11-21), so an attic knee wall reads as a
partition: a ray is closed where the first roof face it meets comes down
across it and a lower wall (the eaves wall) lies beyond the roof's cut. A ray
that meets a roof rising ahead of it is above the roof, and an eaves overhang
with no wall beyond it closes nothing. A wall the roof closes is read again
near its top, so a dormer wall that rises through the roof stays exterior. On
the 17 models 67 walls move, 66 of them in schependomlaan: its 22 `knieschot`
knee walls and 30 more interior-flagged walls under the roof now agree with
their flags (flag agreement there 815 to 853 of 922; 3,572 of 4,564 across
the 17), and 14 exterior-flagged walls standing wholly under the roof
(insulated panels against the cold roof space) now carry a "check it". Details:
[eval/roof-blockers-2026-11-21.md](eval/roof-blockers-2026-11-21.md).

## Geometry it reads

Extruded area solids (rectangle, rounded and hollow rectangle, circle and hollow
circle, ellipse, I, L, T, U, C and Z shapes with root radii, arbitrary outlines
from polylines, indexed poly curves with arcs, composite and trimmed curves,
derived/mirrored and composite profiles); half-space, boxed half-space and
polygonal-bounded half-space clips; boolean difference, union and intersection;
mapped items with uniform and non-uniform scale; faceted breps (with voids),
closed shell and face-based surface models, polygonal and triangulated face
sets; advanced breps whose faces lie on planes and cylinders (edges on lines,
circles, ellipses and B-spline curves); swept disks (Pappus; directrices of polylines, composite curves and indexed curves with arcs);
revolved areas (Pappus); blocks, cylinders, cones and spheres.

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
angle, so it becomes a faceted shell. A face on any other surface (a surface
of revolution with a line or circle profile, a surface of linear extrusion, a
B-spline surface, rational or not) is cut the same way through the surface's
own parameters (`surface.mjs`): its boundary goes to (u, v) (by formula, or
Newton's method on a B-spline), dense straight runs of it are set aside, the
rest is triangulated there and refined by longest-edge bisection until every
inner edge's midpoint on the surface lies within 2e-4 of the face's size of
the straight edge, and the set-aside points are fanned back in. Boundary
points are never moved or added, so the face still meets its neighbours point
for point; a point where the surface pinches (the tip of a ruled face) is run
along in (u, v) as the segment it is, and a face whose meridians meet on a
surface of revolution's axis (half of a domed basin bottom) takes the turn
across that pole instead of reading as a face round the whole surface.
Checked against IfcOpenShell and by formula in
[eval/curved-breps-2026-11-20.md](eval/curved-breps-2026-11-20.md) and
[eval/pole-faces-2026-11-22.md](eval/pole-faces-2026-11-22.md): kleine_Wohnung
reads 775 of 775 advanced breps, and the five curved breps that disagreed with
IfcOpenShell for no named cause are its own meshes with faces turned inside
out (turned back, they agree within 0.3%). Since 2026-11-23 the reference script
checks every brep's mesh for this and the comparison names it
([eval/turned-figure-2026-11-23.md](eval/turned-figure-2026-11-23.md)): unexplained
disagreements on the two models 15 to 5 (the 5 left are tessellation gaps
under 0.3%), and 55 of IfcOpenShell's 56 larger-than-the-box figures are the
same inside-out faces. Since 2026-11-23 the volume of a curved face also
counts the quadratic patch over each flat triangle (its edges' sag times a
third of its area, `bulgeVolume`), so the mesh's inscribed shortfall no longer
reaches the figure
([eval/curved-sag-2026-11-23.md](eval/curved-sag-2026-11-23.md)): 4 of those 5
now agree within 0.012%, and every brep read on FM_ARC_DigitalHub agrees with
IfcOpenShell within 0.1%.
A plane
cuts it by summing, over its faces fanned into triangles, the edge each
triangle leaves in the plane (`shellSection`): concave faces, holes and voids
need no special case.

**Bridges, roads and rail (IFC4X3 alignments, `alignment.mjs`).** Parts placed
by station along an alignment (`IfcLinearPlacement`: distance along, lateral,
vertical and longitudinal offsets) are placed on the alignment's own curves:
an `IfcGradientCurve` (a horizontal of lines, circular arcs and clothoids, with
a vertical profile laid over it), a bare horizontal `IfcCompositeCurve`, or an
`IfcPolyline`. Offsets are measured in the frame the IFC 4.3 text gives
`IfcPointByDistanceExpression`: lateral level to the left, vertical square to
the tangent in its vertical plane, longitudinal as a straight step along the
tangent. Decks, girders, diaphragms, pavement courses and kerbs swept as an
`IfcSectionedSolidHorizontal` are lofted between their cross-sections (each
square to the tangent at its station, its points moving linearly between
stations, sliced every 0.25 degrees of turn), so a curved deck follows its arc
and a crossfall that turns over is measured exactly. On Viadotto Acerno (a
33 MB public IFC4X3 bridge, 6,448 parts), which did not read at all before
2026-11-22: all 1,101 linear placements land within 1.1e-7 m of IfcOpenShell
0.8's, and all 638 lofted solids are within 0.003% of an independent integral
of their sections (area times the centroid's path, Pappus), with their world
boxes matching IfcOpenShell's to 5.7e-14 m (median). 12 diaphragms whose
second section sits 0.20 m past the end of their directrix are lofted on
along the end tangent and carry a note saying so; IfcOpenShell stops them at
the end. ([eval/linear-placement-2026-11-22.md](eval/linear-placement-2026-11-22.md).)
Kerbs, barriers and ditches swept as an `IfcFixedReferenceSweptAreaSolid`
along those curves are sliced the same way, the profile square to the 3D
tangent with its x axis held toward FixedReference (2026-11-22).
Not read yet: cant (`IfcSegmentedReferenceCurve`), spirals other than the
clothoid, `IfcPolynomialCurve` and offset curves as directrices; the
element on such a placement is "not read", and the rest of the file is.

**Reinforcing bars and grid placements (2026-11-22).** A bar swept as a disk
along an `IfcIndexedPolyCurve` of line and arc segments (how bars, stirrups
and links are written) is read with its bends as true arcs, and its cut length
is the directrix's: the BoQ gets a length and, for a bar whose material does
not name GFRP, basalt, stainless or the like, a mass at 7,850 kg/m3, so rebar
can be priced per tonne. On buildingSMART's `reinforcing-stirrup` sample the
bar reads 1.148 m against the 1,150 mm BarLength its type states, and 1.02 kg
(a 12 mm bar's 0.888 kg/m). Columns placed on a structural grid
(`IfcGridPlacement`: the crossing of two grid axes, with offsets, in the
grid's own placement; IFC2X3/IFC4 and IFC4X3 forms) are placed there; before,
each was "not read". Checked on all 46 of buildingSMART's IFC4.3.x sample
models ([eval/bsi-samples-2026-11-22.md](eval/bsi-samples-2026-11-22.md)).

**Not read:** an advanced brep face that wraps all the way round a closed
surface (a band or cap on a surface of revolution), a curved face other than a
cylinder's with a hole in it, a face whose boundary lies more than 1e-3 of its
size off its surface, open shells, tapered extrusions, swept
solids along curves other than disks, centre-line profiles, sloped flanges.
Overlapping openings in one element are taken out once (each opening is
subtracted from the body less the ones before it, so their overlap is added
back; `measure.test.mjs`). A body of several items is their union: where
two items run into each other (a cabinet's carcass and doors, a door leaf set
into its posts) the shared part is counted once, A + B - (A n B), exactly
(`engine.test.mjs`; [eval/item-union-2026-11-21.md](eval/item-union-2026-11-21.md)).
An item whose overlap would take more than 4,000 pieces keeps the plain sum
and the element says so. The overlapping pieces of one shell are counted
twice (the element carries a note). A faceted body
clipped by a half-space, or mixed with a swept disk, revolved area or CSG
primitive, is not cut: it keeps the stored area. A faceted shell of more than
4,000 tetrahedra has no openings taken out ("net not computed"). A faceted covering is cut
normal to its up direction, a rule fitted on one model.
A curved wall's side area is the mean of its two curved faces summed from its
facets, when mean x width matches its volume within 2%, or (for a body with
no cutter terms) when its faces enclose its volume by the divergence theorem
in plan, which allows a stepped section or a duct. Facets lining a channel
inside the wall are left off both faces, and so is a plane whose area lies
far from the foot of the perpendicular from the centre (a half ring's two
ends on one plane). A wall that fails both checks (a body with cutter terms
whose section changes) keeps a plane cut, a chord's elevation, unless it
stores a figure.

## Run it

```
node cli.mjs model.ifc                         # BoQ by class and type, CSV to stdout
node cli.mjs model.ifc --by storey,class       # other groupings
node cli.mjs model.ifc --by uniformat2,uniformat   # elemental estimate (Uniformat II group, element)
node cli.mjs model.ifc --rows elements.csv     # every element
node cli.mjs model.ifc --rooms rooms.csv       # room schedule: floor area, perimeter, height, wall area gross and net, volume
node cli.mjs model.ifc --by space,class        # BoQ room by room
node cli.mjs model.ifc --check                 # stored vs computed summary
node cli.mjs model.ifc --voids-up-to 0.5,0.05  # leave in openings up to 0.5 m2 (areas) / 0.05 m3 (volumes)
node cli.mjs model.ifc --voids-up-to "0,0;walls=0.5,0.05;slabs=0,0.05"  # per work section (walls, slabs, coverings, frames, other)
node cli.mjs new.ifc --compare old.ifc         # change in the BoQ since old.ifc, CSV to stdout
node cli.mjs new.ifc --compare old.ifc --changes changes.csv   # and every changed element
node --test                                    # tests
node eval/stored-vs-computed.mjs a.ifc b.ifc   # the corpus check, volumes
node eval/areas-vs-stored.mjs a.ifc b.ifc      # the corpus check, areas
node eval/measure-rules.mjs a.ifc b.ifc         # what a small-void rule changes, and opening areas vs stored width x height
node eval/revision-diff.mjs r1.ifc r2.ifc r3.ifc   # the change report on consecutive revisions
node eval/uniformat-check.mjs a.ifc b.ifc      # Uniformat coverage, and the rules against authors' codes
node eval/envelope-check.mjs a.ifc b.ifc --svg plans/   # the envelope test against authors' IsExternal flags, with plans
node eval/roof-blockers.mjs a.ifc b.ifc        # the walls sloped roofs move in the envelope test
node eval/rooms.mjs a.ifc b.ifc                # rooms measured vs stored, and elements placed in rooms
node eval/net-wall-finish.mjs a.ifc b.ifc      # doors, windows, curtain walls off each room's walls; geometry vs boundaries
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
