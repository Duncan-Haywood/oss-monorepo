# A clipped wall's Height by the authoring tool's own convention (2026-11-22)

**Question.** Until now the model fill offered no `Qto_WallBaseQuantities`
`Height` for a wall a roof or slab cuts, because exporters disagree on what
that figure is: the extrusion depth before the cut, or the cut wall's highest
point (`eval/wall-axis-lengths-2026-11-21.md`). On the 15 public models, 114
measured walls were held back that way. Can the file itself say which
convention applies, so the fill writes the figure the authoring tool would
have written, and only where that is measured?

## Answer

Yes, from the application the wall's owner history names
(`IfcOwnerHistory.OwningApplication`), and only for the two tools the public
models show:

| Authoring tool | What its export stores for a clipped wall | Clipped walls with a stored Height | matched by that reading | matched by the other reading |
| --- | --- | ---: | ---: | ---: |
| ARCHICAD (FZK-Haus, C20 Institute) | the cut wall's highest point above its base (also its own "Maximale Höhe der Wand") | 11 | **11** | 2 |
| Revit 2010 (HHS construction) | the extrusion depth before the cut | 5 | **5** | 0 |
| **Total** | | **16** | **16** | 2 |

Every other wall that stores a Height (476 unclipped walls on five models) is
still matched, 476 of 476: nothing that was offered before changed. A Revit
2022 export (kleine_Wohnung) adds a third reading for the extrusion rule: its
67 walls whose top is attached to the roof store the extrusion depth (stored
Height equal to the extrusion on 67 of 67), not the height of their
constraints.

## What changed (`geometry-quantities.mjs`)

- `heightConvention(model, element)`: `tallest` for an application named
  ARCHICAD or Graphisoft, `extrusion` for Revit, otherwise none (a wall with
  no owner history takes the file's only application, if there is one).
- `offeredHeight(w, clipped, convention)`: an unclipped wall's extrusion
  depth, as before. A clipped wall gets its highest point under `tallest`, and
  its extrusion depth under `extrusion` only while the body still holds one
  (an extruded body; a brep has lost it). A tool not in the list gets nothing,
  as before. `computed.lines.heightFrom` records `body`, `tallest` or
  `extrusion`.
- **The highest point was under-read on mitred walls.** The tallest vertical
  line was only tried on the two faces and the middle plane, a hair inside
  each vertex along the wall. On C20's Wand-003 (a 2 m wall mitred at both
  ends under a hip roof) the highest point, 2.0257 m, sits at a mitre's acute
  corner, where no such line is inside the wall, so it read 1.985 m (2.0% low,
  2 of the 11 ARCHICAD walls). Lines through every vertex of the body, nudged
  a hair into each quadrant around it (not diagonally: a 45-degree mitre's
  face would hold a diagonal line), now find 2.02569, the stored figure to the
  fifth decimal. This runs on extruded bodies only.
- **A brep's highest point is its own extent.** A faceted body's faces hold
  the cut already, so for `tallest` its height is its vertices' extent. The
  vertical-line reading is not used on a brep: on bodies fanned into
  tetrahedra, lines along the slivers' faces over-read it (2.6999 m on a wall
  whose top is at 2.0257).

## Setup

The same 15 public models as `eval/wall-brep-lengths-2026-11-21.md` (the HHS
Office models and the Schultz Residence from `opensourceBIM/IFC-files` at
`cb96c50`, the rest from `ThatOpen/engine_web-ifc` `tests/ifcfiles/public`).

```
node --max-old-space-size=7000 eval/wall-cut-top-heights.mjs MODEL.ifc ... --json eval/wall-cut-top-heights-2026-11-22.json
node eval/model-fill-sweep.mjs Schultz_Residence.ifc eval/wall-axis-lengths OUT/Schultz_Residence --write 1 --modes geometry
python3 eval/model_fill_ifctester.py OUT/Schultz_Residence Schultz_Residence.ifc   # IfcOpenShell 0.9.0.post1, IfcTester 0.9.0
```

Per-model output: `wall-cut-top-heights-2026-11-22.txt` and `.json`; the fill
line: `wall-axis-lengths/fill-cut-top-2026-11-22.jsonl`.

## 1. Coverage

| | Walls |
| --- | ---: |
| Measured (of 3,312) | 3,247 |
| Height offered before | 3,133 |
| Clipped | 114 |
| Height offered now | **3,159** (+26: ARCHICAD 11, Revit extruded 15) |
| Clipped and still none: Revit breps (HHS construction 11, ISSUE_129 23, dental_clinic 10, advanced_model 5) | 49 |
| Clipped and still none: a tool with no known convention (HouseZ, Rhino) | 39 |

The new heights land on FZK-Haus (2), C20 (9), HHS construction (5) and the
Schultz Residence (10). The first three store a Height already, which is how
the rule was checked; only Schultz's 10 are new information.

## 2. The fill

`eval/wall-axis-lengths/wall-lines.ids.xml` on the Schultz Residence (Revit
2014), the one model where the new heights are not stored already:

| | before this change | after |
| --- | ---: | ---: |
| Walls failing after the fill (of 105) | 14 | **5** |
| Values written (all measured) | 192 | 200 |
| Read back passing here | 192 | 200 |
| IfcTester 0.9.0: failing before and passing after | | **200 of 200** |
| Newly failing in IfcTester | | **0** |

The 5 walls left are the ones with no body read. C20 and HHS construction
take their heights from the model's own `BaseQuantities` (a model's value
always wins over a measured one), so their fill does not change.

## 3. Tried and not shipped: Revit's own constraints

Revit exports also write each wall's constraints into a set of their own
(`PSet_Revit_Constraints`; German `Abhängigkeiten`, French `Contraintes`):
base level and offset, top level and offset, and the unconnected height. The
height they describe (top level + top offset - base level - base offset, or
the unconnected height when the top is not tied to a level, with the levels'
elevations from the storeys of the same name) was tested against every
stored Height on the three Revit models that store one:

| | Walls | Within 2% of the stored Height |
| --- | ---: | ---: |
| Top not attached | 232 | 199 |
| Top attached to a roof or slab | 67 | **0** |
| A level that is not a storey | 59 | - |

It is right where nothing else is going on (kleine_Wohnung's unattached
walls, 84 of 84) and wrong in two common cases: a top attached to a roof (the
attached walls store the extrusion depth, which the constraints do not give),
and walls Revit splits by storey on export (HHS construction: a wall from
Level 1 to the roof, 10.506 m by its constraints, is exported as
storey-high pieces of 3.3 to 3.7 m, each carrying the whole wall's
constraints; 11 of 36 match). The unconnected height alone is staler still:
it keeps its last value once the top is tied to a level (2.8 m on walls 4.6 m
high). So none of it is used, and a Revit brep with a cut top, whose
extrusion depth is gone, still gets no Height.

## What is left

- Revit breps with a cut top (49): the unclipped height they would store is
  not in their faces, and the constraints are no reference (section 3).
- Other authoring tools (Rhino via Asuni here, 39 walls; Tekla, Vectorworks,
  Allplan and others): no public model here stores a clipped wall's Height
  for them, so no convention is assumed.
- Curved walls (an arc axis), as before.
