# Openings' quantities from their bodies (2026-11-22)

**Question.** `Qto_OpeningElementBaseQuantities` (`BaseQuantities` in IFC2x3
exports) holds an `IfcOpeningElement`'s `Width`, `Height`, `Depth` and `Area`:
what a demolition or core-drilling estimate, a fire-stopping schedule or a
precast plant's recess list reads. The model fill measured nothing on
openings (ifc-quantity-takeoff's rows hold none: openings are what it cuts
out), so an IDS asking for any of the four left every opening in the to-fill
table. The 2026-11-22 inventory (`eval/footing-quantities-2026-11-22.md`)
named openings as the largest class storing figures the fill could not give.
Which exports store the set, how does each tool measure it, and can the
opening's own body give the same figures?

## Where the figures are

Every opening that stores any of the four, on the 28
`ThatOpen/engine_web-ifc` `tests/ifcfiles/public/` models and the four
`opensourceBIM/IFC-files` exports used since 2026-11-17 (blob-less sparse
clones, not committed):

| File | Tool | Openings storing the set |
| --- | --- | ---: |
| AC20-FZK-Haus, ISSUE_005_haus | ARCHICAD (4009 GER) | 16 + 16 |
| C20-Institute-Var-2 | ARCHICAD (4009 GER) | 283 |
| schependomlaan | ArchiCAD (6000 NED) | 74 |
| ISSUE_068_ARK_NUS_skolebygg | Revit 2019 | 787 |
| ISSUE_159_kleine_Wohnung_R22 | Revit 2022 | 66 |
| HHS Office architect, construction | Revit Architecture 2010 | 208 + 9 |

Revit 2011 (Office_A, dental_clinic, duplex), Revit 2017 and 2021 exports
have openings but store none of the four. No other tool's export stores them.

```
node eval/opening-quantities.mjs <the eight> --json eval/opening-quantities-2026-11-22.json   # opening-quantities-2026-11-22.txt
node eval/opening-quantities-fill.mjs <seven: not ISSUE_005, a copy of FZK-Haus> --out OUT    # opening-quantities-fill-2026-11-22.txt
python3 eval/model_fill_ifctester.py OUT OUT/hidden/*.ifc   # IfcOpenShell 0.9.0.post1, IfcTester 0.9.0; opening-quantities-ifctester-2026-11-22.txt
```

## How each tool measures an opening

Read against each opening's `Body` (every one an `IfcExtrudedAreaSolid`, or
two in ARCHICAD's case) and the wall it voids:

- **ARCHICAD** writes two extrusions of one profile, mirrored through the
  wall's middle. `Width` is the profile's side across the extrusion on the
  level, `Height` its upright side, `Area` the profile's own area (a round
  window's 0.7851 m2 polygon, not 1 x 1 m), and `Depth` the voided wall's
  thickness: on 359 of 359 openings in walls it equals the wall's thickness
  as the takeoff measures it, while a round window's two extrusions run
  0.485 and 0.415 m through a 0.30 m wall and schependomlaan's single
  extrusion runs 0.342 m through a 0.114 m one.
- **Revit** writes `Depth` as the extrusion depth, whatever that cuts (a
  window's cutter runs 10 ft, so 3.048 m is stored through a 0.5 m wall). Its
  `Width` and `Height` are the profile's own sides, not upright and across.
  The open-source exporter turns a wall opening's rectangle so its x side is
  upright on purpose (`ExtrusionExporter.CreateRectangleProfileDefIfPossible`
  in github.com/Autodesk/revit-ifc: "the 'X' direction of the profile
  corresponds to the global Z direction"), and Revit 2019 and 2022 store
  that x side as `Width`: 589 of ARK_NUS's 775 wall openings store the
  window's height as their `Width`. A floor or roof opening (a vertical
  extrusion) stores its y side as `Width`. Revit 2010 stores the y side as
  `Width` in both cases. `Area` is the profile's area (HHS's 102 round shafts).
  The years between (2011 to 2018) store no set in a public export, so the
  rule is not assumed for them.

Measured as the eval reads them (`/tmp` scratch scripts, not committed),
before any rule was written: under "the upright side is Height", Revit 2019's
wall openings match 186 of 775; under "Width is the profile's x side", 775 of
775.

## What is offered

`openingElementLines` in `geometry-quantities.mjs` (run by
`addOpeningElementQuantities` in `measureModel`), by the application the
opening's owner history names:

| Figure | ARCHICAD | Revit 2019 on | Revit 2010 and before | others, Revit 2011-2018 |
| --- | --- | --- | --- | --- |
| Width | across, on the level (wall openings only) | profile x (wall), y (floor) | profile y | none |
| Height | upright side (wall openings only) | profile y (wall), x (floor) | profile x | none |
| Depth | the voided wall's thickness | extrusion depth | extrusion depth | none |
| Area | profile area | profile area | profile area | none |

ARCHICAD's figures need every extrusion level and of one profile; Revit's one
extrusion. A body of any other kind (Revit 2022's 102 `IfcAdvancedBrep`
openings in kleine_Wohnung) offers nothing.

## Results

Against the stored figures (`eval/opening-quantities-2026-11-22.txt`):

| Convention | Figure | Stored | Offered | Within 1% | Misses | Held back |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| ARCHICAD | Width | 389 | 389 | 385 | 4 | 0 |
| ARCHICAD | Height | 389 | 389 | 388 | 1 | 0 |
| ARCHICAD | Depth | 389 | 375 | 375 | 0 | 14 |
| ARCHICAD | Area | 389 | 389 | 384 | 5 | 0 |
| Revit 2010 | Width, Height | 115 each | 115 each | 115 each | 0 | 0 |
| Revit 2010 | Depth | 217 | 217 | 217 | 0 | 0 |
| Revit 2010 | Area | 102 | 102 | 102 | 0 | 0 |
| Revit 2019/2022 | Width, Height | 844 each | 844 each | 841 each | 3 each | 0 |
| Revit 2019/2022 | Depth | 766 | 766 | 766 | 0 | 0 |
| Revit 2019/2022 | Area | 9 | 9 | 3 | 6 | 0 |

**4,532 of 4,554 offered figures within 1% of the stored ones** (worst 0.57%).
Each of the 22 others was read by hand:

- schependomlaan's four `merk J`/`Jsp` windows (Width and Area, 8): a 0.90 m
  window in a 1.53 x 2.64 m opening, storing a 0.30 m `Width`, the same
  slip `eval/door-window-quantities-2026-11-22.md` found on their windows.
- schependomlaan's `merk D` (Height and Area, 2): 1.727 m stored for a 1.76 m
  opening, 1.9% off; no reading of the body gives 1.727.
- ARK_NUS's three roof openings (Width, Height and Area, 9) and three more
  roof openings' Area (3): each stores the whole roof's figures (6.95 x
  3.2 m, 240 or 1,015 m2) on a 1.2 x 1.0 m cut.

The 14 held back are schependomlaan openings in `IfcBuildingElementProxy`
hosts, whose thickness the takeoff does not measure as a wall's.

The fill end to end, every stored `Width`, `Height`, `Depth` and `Area`
renamed so the model holds none, and
`eval/opening-quantities/opening-quantities.ids.xml` (the four on every
`IFCOPENINGELEMENT`) filled with `--from-geometry`
(`eval/opening-quantities-fill-2026-11-22.txt`): 5,806 values written on
seven files (ARK_NUS 3,156 in 22 s), every one re-read and verified by the
checker; ARK_NUS, HHS architect and construction pass every check after; the
rest leave the openings the table names (an advanced brep, a proxy's opening's
Depth). Every rewritten stored figure lands where the comparison above put
it. IfcTester opens every filled file and takes exactly the 5,806 written
values from failing to passing, none newly failing
(`eval/opening-quantities-ifctester-2026-11-22.txt`).

## Limits

- Two tools. Another tool's export storing the set (Tekla, Allplan, Vectorworks)
  would need its own reading; none is public.
- Revit 2011 to 2018 are left out because no public export from them stores
  the set; Revit 2021's `advanced_model` and 2017's N1540 have openings but no
  quantities.
- Revit 2022 openings exported as advanced breps (102 of 168 in kleine_Wohnung)
  get nothing; their rectangle would have to be found in the brep's faces.
- `Volume` (ARCHICAD stores it on all 389) is not offered: it is neither the
  opening's volume (0.086 m3 stored for a 0.885 x 2.01 x 0.24 m door) nor the
  wall's removed volume, and no reading of the geometry tried gives it.
