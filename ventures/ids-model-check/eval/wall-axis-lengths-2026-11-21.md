# Wall Length and Height from the axis and the body (2026-11-21)

**Question.** The model fill's geometry option (`--from-geometry`, page
checkbox) measured `Qto_` volumes and areas but left every wall `Length` and
`Height` to the to-fill table: a centre-line length "needs the wall's axis
representation" (`eval/qto-from-geometry-2026-11-21.md`, What is left). With
the axis read, how close do measured lengths and heights come to what
exporters stored, and does the fill keep its guarantees (every written value
passes here and in IfcTester, nothing else changes)?

## The finding that shaped the method

The `Axis` curve's own length is **not** the wall's length. ARCHICAD draws
the axis on the wall's reference line, often one face, and runs it to the
reference line's corners. FZK-Haus's Wand-Int-ERDG-4: axis 4.59 m; the faces
4.05 m and 4.29 m; the stored `Length` 4.17 m, which ARCHICAD's own
properties name *Durchschnittliche Länge* (average length) and *Länge der Wand
in der Achse*. Revit draws the axis on the location line and stores its
length, so on Revit exports the curve's length happens to agree.

So the axis gives the **direction**, and the length is measured on the body:
along that direction, on the plane halfway through the wall's thickness, at
the level where the wall is longest (a gable wall's base). The body is read
as ifc-quantity-takeoff holds it, a signed sum of convex pieces (a roof clip
is a negative piece), so a line's inside is where the signs add above zero
(`geometry-quantities.mjs`, `wallLines`).

`Height` is the extrusion depth (the Qto_ definition: "usually the extrusion
depth"): the positive pieces' extent up the wall. Exporters disagree on a
wall a roof or slab clips: Revit stores the unclipped depth, ARCHICAD the
clipped wall's tallest point. Where those two differ by more than 0.5% the
fill offers **no** Height and the table row says the geometry gave none.
Only straight axes are read (a curved or bent axis, or none: no Length or
Height), and only walls whose own z is the world's up.

## Setup

15 public models with walls: the HHS Office construction and architect
exports and OpeningDesign's Schultz Residence (`opensourceBIM/IFC-files` at
`cb96c50`, fetch steps in `model-attr-codes-2026-11-17.md`), and 12 files from
`ThatOpen/engine_web-ifc` `tests/ifcfiles/public` (sparse clone, as in
`../ifc-quantity-takeoff/eval/areas-vs-stored-2026-11-20.md`).

```
node --max-old-space-size=7000 eval/wall-axis-lengths.mjs MODEL.ifc ... --json eval/wall-axis-lengths-2026-11-21.json
node eval/model-fill-sweep.mjs MODEL.ifc eval/wall-axis-lengths OUT/<model> --write 1 --modes geometry
python3 eval/model_fill_ifctester.py OUT/<model> MODEL.ifc     # IfcOpenShell 0.9.0.post1, IfcTester 0.9.0
```

Full per-model output: `eval/wall-axis-lengths-2026-11-21.txt` and `.json`;
fill lines: `eval/wall-axis-lengths/fill-2026-11-21.jsonl`.

## 1. Against what exporters stored

Five models store wall lengths and heights (the others store none, so they
speak only to coverage below):

| Model (exporter) | Stored | Length within 2% | the axis curve's own length | Height (extrusion) within 2% | Heights offered (not clipped) | of those within 2% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HHS construction (Revit) | 36 | 35 | 35 | 36 | 31 | 31 |
| HHS architect (Revit) | 112 | 86 | 86 | 112 | 112 | 112 |
| kleine_Wohnung_R22 (Revit) | 210 | 210 | 210 | 210 | 210 | 210 |
| AC20-FZK-Haus (ARCHICAD) | 13 | 13 | **0** | 11 | 11 | 11 |
| C20-Institute-Var-2 (ARCHICAD) | 121 | 121 | **39** | 114 | 112 | 112 |
| **Total** | **492** | **465** | 370 | 483 | **476** | **476** |

- **Length: 465 of 492 within 2%** (94.5%), against 370 for the axis curve's
  length; on the ARCHICAD files, 134 of 134 against 39.
- The other 27, all on the two HHS Revit exports: **19** where the exporter's
  own `GrossSideArea / Height` (or volume over height and width) agrees with
  the measured length, so the stored `Length` disagrees with the exporter's
  other figures for the same wall; **4** where the difference is half or all
  of a joined wall's thickness (Revit's length running to the middle or far
  face of the wall it meets); **4** unexplained (differences of 0.06 to 0.2 m
  on short partition walls).
- **Height: every offered value where one is stored agrees, 476 of 476.** The
  16 not offered are the clipped walls: 5 on HHS construction (stored the
  unclipped depth) and 9 on the ARCHICAD files (7 stored the clipped tallest
  point, 2 neither); writing either figure would have been wrong for one
  exporter or the other.

## 2. Coverage

Of 3,312 walls in the 15 models, 3,072 have a straight axis and 2,955 are
measured (the rest have a faceted brep body, which `wallLines` does not read
yet, or no body read); HouseZ has no `Axis` representation at all (140 walls,
nothing offered). Heights are offered on 2,929 of the 2,955; the other 26 are
clipped walls.

## 3. The fill with geometry on

`eval/wall-axis-lengths/wall-lines.ids.xml` (written for this check: walls
carry `Qto_WallBaseQuantities.Length` and `Height`):

| Model | Failing before | after | Values written | measured | copied from the model | Read back passing | IfcTester: fail before, pass after | newly failing |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Schultz_Residence | 105 | 14 | 192 | 192 | 0 | 192 | 192 / 192 | 0 |
| FM_ARC_DigitalHub | 178 | 0 | 356 | 356 | 0 | 356 | 356 / 356 | 0 |
| duplex | 57 | 1 | 112 | 112 | 0 | 112 | 112 / 112 | 0 |
| HHS construction | 48 | 12 | 72 | 0 | 72 | 72 | 72 / 72 | 0 |
| AC20-FZK-Haus | 13 | 0 | 26 | 0 | 26 | 26 | 26 / 26 | 0 |

- **758 values written, 660 of them measured; every one reads back passing
  here and in IfcTester**, and no element IfcTester passed before fails
  after. Changed lines equal the records the fill says it added in every
  file.
- Schultz's 14 left: 4 walls with no body read and 10 roof-clipped walls
  whose Height went to the table. HHS construction's 12 are walls exported
  as faceted breps with no stored `BaseQuantities`: they stay with the table. Where the model already stores a quantity in
  another set (IFC2X3 `BaseQuantities`), that value is still copied ahead of
  the measured one.

## What is left

- Faceted brep walls (HHS construction's 12): a length and height from the
  shell's faces.
- Curved walls (an arc axis): the middle line's arc length; no public model
  here stores one to check against.
- Walls with no `Axis` (HouseZ): the direction could come from the takeoff's
  side-area plane; not done, so these stay with the table.
- Beam, column and member `Length`: nominal figures cut-backs make ambiguous,
  and none of these models stores one with an axis to compare.
