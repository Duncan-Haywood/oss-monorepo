# The change report on a BlenderBIM series, and storeys renamed in place, 2026-11-23

**Question.** The change report (`diff.mjs`) had been run only on Revit
exports (Aalseth Residence, Lake Kegonsa Home) and on BIMserver test edits
(HHS Office). `flagships.yaml` asked for a public series from another
authoring tool. What does the report get right and wrong on one?

## Data

**Tulpstraat** (`github.com/C-Claus/Tulpstraat`, `Tulpstraat.ifc`): a model
of a real terraced house in Arnhem, drawn in BlenderBIM (IfcOpenShell 0.7,
BlenderBIM 0.0.231104 to 0.0.240402, IFC4) and committed 12 times between
2024-02-08 and 2024-04-16. The repository has no licence file, so **the
models are not committed here**; fetch them with

```
git clone --filter=blob:none --no-checkout https://github.com/C-Claus/Tulpstraat.git
cd Tulpstraat && i=0; for c in $(git log --reverse --format=%h -- Tulpstraat.ifc); do
  i=$((i+1)); git show $c:Tulpstraat.ifc > ../$(printf %02d $i)-$c.ifc; done
node eval/revision-diff.mjs 01-*.ifc 02-*.ifc ... 12-*.ifc --json out.json
```

Output: `revision-diff-tulpstraat-2026-11-23.txt` and `.json`.

This series is different from the Revit ones in a useful way. BlenderBIM
edits the IFC file itself, so an element keeps its GlobalId for as long as
it exists: every one of the 11 steps matched 100% of its pairs by GlobalId
(no Tag or geometry fallback was needed or used). And each commit message
says what the author did, which gives a rough answer to check against.

## Step by step

| Step | Commit message | Report | Agrees? |
|---|---|---|---|
| 1 -> 2 | "get rid of couch" | 1 IfcFurniture removed, 28 unchanged | yes |
| 2 -> 3 | "add void" | 1 element's volume and area changed, 2 more furniture removed | yes (the void); the furniture is not in the message |
| 3 -> 4 | "add drawing" | window, stair, WC added; 17 walls' material "Unknown" -> "brick" | the material is real: material #67 was renamed `Unknown` -> `baksteen` and a layer set "brick" assigned |
| 4 -> 5 | "add brick and rowlocks" | 7 added (plinth, rowlock courses, fanlight, masonry), 1 slab removed, interior walls re-typed to 50 mm (volumes halved) | yes, **but** see below |
| 5 -> 6 | "add brick facade" | 1 masonry wall replaced, 1 typeless placeholder wall removed | yes |
| 6 -> 7 | "added beams" | 29 beams, 8 party walls, 5 roofs added; 2 side facades removed | yes (beams); the walls and roofs are not in the message |
| 7 -> 8 | "constructie toegevoegd" | the front facade and its door, windows and rowlocks removed; two sets of 3 walls merged into 1 (volume 2.0157 -> 2.0157 and 2.0094 -> 2.0294 m3) | plausible: the merge volumes agree |
| 8 -> 9 | "added archive" | 5 party walls thickened (volume x3), 14 joists out, 7 in | the message names only the scans added beside it |
| 9 -> 10 | "materialen toegevoegd" | 31 elements removed (14 walls, 6 doors, 5 roofs, ...), 2 footings and 3 beams added, 2 party walls renamed | the message names only materials; the file lost 6,561 lines |
| 10 -> 11 | "added pointcloud" | 1 beam added, 1 moved 0.15 m | not in the message |
| 11 -> 12 | "add pointcloud trace" | 1 slab added | plausible |

No step shows a pairing error: nothing was reported added and removed that
was the same element, which is what a tool that keeps GlobalIds should give.
Where the report says more than the commit message (2 -> 3, 6 -> 7, 9 -> 10),
the elements are in the files; a commit message is a person's summary.

## What it got wrong: a storey renamed in place

Step 4 -> 5 listed **all 28 matched elements as changed**, every one with
"storey: My Storey -> 00_begane_grond". The file says why:

```
04: IFCBUILDINGSTOREY('04vbjRRgXDWOc9F5HsiQf4',$,'My Storey',...
05: IFCBUILDINGSTOREY('04vbjRRgXDWOc9F5HsiQf4',$,'00_begane_grond',...
```

One storey, same GlobalId, renamed (BlenderBIM's default "My Storey" given
the Dutch "ground floor" name; a second storey was added). No element moved.
For 4 of the 28 (two windows, the stair, the WC) the rename was the only
thing listed, so an estimator reading "28 changed" had 4 to open for
nothing, and on the other 24 the storey line was noise beside the real
change.

**The rule.** The takeoff now keeps the storey's and the type's own GlobalIds
on each row (`storeyGlobalId`, `typeGlobalId`, `qto.mjs`). In `diffTakeoffs`:

- a storey whose name differs under the same GlobalId is a **rename**: listed
  once in `renames.storey` (page: a "Storeys / types renamed" card and a
  "Storey renamed" row; changes CSV: a `storey renamed` row; CLI
  `--compare`: the count), not an attribute change on its elements; an
  element whose only difference was that is unchanged (`renamedOnly`);
- the merge/split and replaced-in-place steps take a renamed storey as the
  same storey (before, a window replaced in place across this rename would
  have been refused for being on "another storey");
- the GlobalIds only ever remove a change, never add one: the same storey
  name under a new GlobalId is still the same storey, because a re-export may
  regenerate GlobalIds (the Kegonsa exporter switch did).

**Types are not treated the same way**, and the Revit control is why. The
same step renamed the wall type "TYPEX" to "buitengevel" under its GlobalId
(`3s6Cf9sGb2Rx1hMXDaCRM5`), a cosmetic rename. But on Lake Kegonsa, Revit kept
a type's GlobalId while a glulam "5.125x6" became steel "HSS3.500X0.203", and
"HSS3.500X0.203" became "HSS 3.500 x 0.188" (a thinner wall, so less steel).
Those are priced changes. A type name is the specification, so a type whose
name changed under one GlobalId is listed in `renames.type` and **still
listed as a type change** on each element, marked "same type GlobalId:
renamed or re-specified" so a reader can tell it from an element given
another type.

## Result

| Series | Step | Changed before | After | Unchanged (rename only) | Storey flags |
|---|---|---|---|---|---|
| Tulpstraat (BlenderBIM) | 4 -> 5 | 28 | 24 | 4 | 28 -> 0 |
| Tulpstraat | the other 10 steps | | same | 0 | 8 -> 8 |
| Lake Kegonsa (Revit) | 0 -> 1 | 30 | 30 | 0 | 24 -> 23 |
| Lake Kegonsa | the other 5 steps | | same | 0 | same |
| Aalseth (Revit) | 4 steps | | same | 0 | same |

Both Revit series give the same counts as the code before this change, run
on the same files the same day (baseline from `HEAD`), on every step.
Kegonsa's 0 -> 1 has two real storey renames too: Revit level `...tjw` keeps
elevation 0 ft and goes "1st Floor" -> "2nd Floor", `...t3p` keeps 8.04 ft
and goes "2nd Floor" -> "3rd Floor", and a new level at -3.83 ft takes the
name "1st Floor" (the practice added a level below). Of that step's 24
storey flags, 1 was this rename and goes; the other 23 are elements that
really moved to another level (16 from "Garage Roof" to "3rd Floor", 3 to
"Top of Kneewall", 3 to "Top of Stone", 1 to "Ceiling").

**Seeded faults.** Each of these fails a test in `diff.test.mjs`: the
rename test switched off (3 tests), a missing GlobalId counted as the same
storey (3), renamed storeys left out of the pairing steps (1), and the takeoff
not passing the storey's or the type's GlobalId through (1 each, the test
that edits `samples/sample-office.ifc`'s storey and wall type names in the
file text), and type renames suppressed like storey renames (2).

## What this does not show

One BlenderBIM author, one house, 2024. A storey given the name of another
storey that was deleted (the same name, a new GlobalId) still reads as the
same storey, by design. Material renames are not caught: IfcMaterial has no
GlobalId (step 3 -> 4's "Unknown" -> "brick" is material #67 renamed, and
the report lists it on 17 walls). Step 9 -> 10 removed 31 elements in a
commit about materials; whether the author meant to is not something the
file can say. Whether an estimator wants a type rename under one GlobalId
counted as a change (the choice here) still needs a person who prices
change orders. Next: an ArchiCAD or Vectorworks series, and a BlenderBIM
series where elements are deleted and redrawn rather than edited.
