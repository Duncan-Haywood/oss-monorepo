# The change report on real model revisions, 2026-11-20

**Question.** An estimator who gets a new issue of a model wants the change
since the last one: which bill-of-quantities lines moved, and which elements
were added, removed or edited. The obvious key is the IFC GlobalId. Does it
hold between real exports, and when it does not, can the report still pair
the elements up?

**Data.**

- **Aalseth Residence** (OpeningDesign, `github.com/OpeningDesign/Aalseth_Residence`,
  `Models & CAD/BIM/3196 Aalseth Lane.ifc`, CC BY-SA 4.0, so **not committed**):
  five Revit 2019 IFC2X3 exports of one house, committed on 2019-11-08 (twice),
  2019-11-09 (twice) and 2019-11-13, commits `7766411`, `b39c362` ("ifc model
  with parts"), `f1be1d3`, `70e393f` ("updated ifc with parts") and `7257e4c`
  ("updated IFC model, with updated stair"). Fetch each with
  `git show <commit>:"Models & CAD/BIM/3196 Aalseth Lane.ifc"` from a
  blob-less clone. These are a practice's real working revisions, not
  test files.
- **HHS Office** (`opensourceBIM/IFC-files` at `cb96c50`, `HHS Office/`):
  `architect.ifc`/`architect2.ifc`, `construction.ifc`/`construction2.ifc` and
  `MEP.ifc`/`MEP2.ifc`. The first two pairs differ by one line each (a
  BIMserver test edit: one element given a new GlobalId, the architect's wall
  also renamed); `MEP2.ifc` is `MEP.ifc` re-serialised by BIMserver (new
  header, same 665,224 entity lines). They are controls with a known answer.

**Method.** `node eval/revision-diff.mjs <files in order>` (output in
`revision-diff-aalseth-2026-11-20.txt` and `.json`, `revision-diff-hhs-2026-11-20.txt`).
It runs the takeoff on each file and `diffTakeoffs` (`diff.mjs`, the code the
page runs) on each consecutive pair. Elements are matched by GlobalId; then,
among the rest, by Tag within a class when the Tag is unique in both files
(Revit writes its ElementId there); then by geometry (same class, world box
within 10 mm, volume within 0.5%, one candidate only). An element on one side
whose box holds the centres of two or more on the other side, on the same
storey, with volumes summing to its own within 2%, is reported as merged or
split. A matched pair is changed when a bill-of-quantities quantity moves by
more than 0.5%, an attribute (class, name, type, storey, material,
classification) differs, its box moved more than 10 mm at the same size, or
its box changed size.

## Controls (HHS Office)

| Pair | Elements | GlobalId-only says | This report says |
|---|---|---|---|
| architect -> architect2 | 2,527 | 1 added, 1 removed | 1 changed: the wall, matched by Tag, name "Basic Wall:MW 11.5:573383" -> "New Wall:MW 11.5:573383" |
| construction -> construction2 | 339 | 0 added, 1 removed | 0 changed; the column reported as the same element under a new GlobalId (matched by Tag) |
| MEP -> MEP2 (re-serialised) | 3,964 | 0 | 0 changed |

Each matches the known edit exactly; the re-serialised file, whose every
entity was rewritten by another program, gives no false change. The
construction pair holds a trap: the column's "new" GlobalId is the floor
slab's, so `construction2.ifc` carries one GlobalId twice (an invalid file;
GlobalIds must be unique). A GlobalId-only comparison sees no new id and
loses the column. The report counts repeated GlobalIds (`duplicateGlobalIds`
in the summary), pairs a repeated one with the element of the same class, and
matches the column by Tag; the first version kept the last row per GlobalId
and got this file right only because the slab comes later in it (a test now
orders them the other way).

## The Aalseth Residence, four steps

| Step | Elements | GlobalId-only: added / removed | This report: added / removed | Same element, new GlobalId | Parts and hosts paired | Changed |
|---|---|---|---|---|---|---|
| 1 -> 2 (11-08 -> 11-08) | 1,547 -> 1,023 | 46 / 570 | 3 / 555 | 6 (Tag) | 9 hosts split into 37 parts | 54 |
| 2 -> 3 (11-08 -> 11-09) | 1,023 -> 1,065 | 90 / 48 | 75 / 5 | 6 (Tag) | 37 parts merged into 9 hosts | 19 |
| 3 -> 4 (11-09 -> 11-09) | 1,065 -> 1,092 | 43 / 16 | 3 / 2 | 6 (Tag) | 8 hosts split into 34 parts | 3 |
| 4 -> 5 (11-09 -> 11-13) | 1,092 -> 1,236 | 171 / 27 | 161 / 17 | 10 (8 Tag, 2 geometry) | 0 | 276 |

Across the four steps a GlobalId-only comparison lists **190 element records
as added or removed that are the same building element**: 28 elements under a
new GlobalId (two records each) and 134 records that are a host and its parts.

What the rows show:

- **The same six elements get new GlobalIds in every export.** Four doors
  (two garage doors, an Andersen outswing door, a sidelight), one wall ("Walls
  5", a 0.006 m3 sliver) and one gutter family exported as a window. Their
  Revit ElementIds (the Tag) stay the same, so they match by Tag every time.
  Step 4 -> 5 adds three more windows and a wall by Tag, and one wall and one
  pipe fitting by geometry (no unique Tag).
- **Parts switch on and off.** In the exports made "with parts" (steps 2 and
  4), Revit writes each layered floor, roof and some walls as its parts (two
  to five layers, named "Part:<id>", the roof's parts as IfcRoof though the
  roof itself is an IfcSlab) instead of the host. Slab and roof parts sum to
  the host's volume to 1e-4 m3 or better (30.6818 m3 both ways for the TJI
  floor); wall parts differ from the host by 0.2 to 1.6% (2.0233 against
  2.0315 m3 for the shear wall), because the layers are trimmed differently
  at the corners. Three wall parts in steps 1 -> 2 and 2 -> 3, and one host
  wall in step 3 -> 4 (the basement furring), stay unpaired.
- **Step 1 -> 2 is mostly an export setting.** The first export carries 419
  building-element proxies, 48 members, 21 plates, 12 furnishings and more
  that the later ones do not; they are reported as removed, which is what
  happened to the file, though not to the design. 48 elements changed storey.
- **Step 4 -> 5 is the design change its commit names.** 276 elements changed:
  the stair's flights, landing and stringers resized (e.g. Run 1 from 1.81 x
  0.99 x 1.24 m to 1.57 x 0.98 x 1.08 m, volume +0.029 m3), joists re-typed,
  18 elements moved 0.16 m in x together, 122 proxies and 10 slabs added.

**What this does not show.** No estimator read these reports; whether
"reshaped" and "moved" are the categories a change order needs is a guess.
(Fixed 2026-11-21, open-shell-boxes-2026-11-21.md: every element now has a box.) Elements whose faceted body keeps no faces have no box (32 to 155 per file
here) and can match only by GlobalId or Tag. The 2% group tolerance and 10 mm
box tolerance were chosen on this house; a model with many thin, coincident
layers could pair the wrong ones (every pairing is listed in the CSV for that
reason). The house's numbers are from the files as committed; nothing was
measured on site.

**Seeded faults.** Turning off the Tag step, the storey test on groups, the
size test that separates moved from reshaped, or the same-class preference
for a repeated GlobalId each fails a test in `diff.test.mjs`; so does
matching a geometry candidate when two fit.
