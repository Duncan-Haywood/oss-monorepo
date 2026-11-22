# A Revit door's and window's base quantities from the size parameters it exports (2026-11-22)

**Question.** The model fill measures doors' and windows' `Qto_` `Width`,
`Height`, `Area` and `Perimeter` from the opening each fills, but only for
ARCHICAD exports (`eval/door-window-quantities-2026-11-22.md`): the three public
Revit exports stored figures the opening does not give (a Revit 2022 door's
2.05 m height in a 2.15 m opening, a Revit 2019 door's 0.99 m width in a
1.01 m one), and no single geometric rule fitted all three. So every Revit
door and window went to the to-fill table. What does Revit store?

## The exporter says

The Revit IFC exporter is open source (`github.com/Autodesk/revit-ifc`,
read at its current `main`; only read, no code copied). Its
`Exporter/PropertySet/Calculators`:

- `WidthCalculator`: an `IfcQtyWidth` parameter override if the user set one,
  else for doors `DOOR_WIDTH` and windows `WINDOW_WIDTH`, from the element or,
  failing that, its type (`GetDoubleValueFromElementOrSymbol`).
- `HeightCalculator`: the same with `DOOR_HEIGHT` / `WINDOW_HEIGHT`.
- `AreaCalculator`: `IfcQtyArea` override, else for doors and windows
  height x width of those same parameters. The door/window branch is in the
  2018-12-10 version (`0f5a6fa`) and every later one.
- `PerimeterCalculator`: override, else `HOST_PERIMETER_COMPUTED`, else the
  extruded body's outer perimeter: a body figure, not the parameters.
- `ExporterInitializer_QsetDef.cs` defines `Qto_DoorBaseQuantities` and
  `Qto_WindowBaseQuantities` for IFC4 and IFC4x3 exports only; an IFC2x3
  export writes the older `BaseQuantities` set by other code.

So the source is not geometry but the family's own `Width` and `Height`
parameters. Revit's default export also writes those parameters as
properties, grouped by parameter group: `Dimensions` / `Dimensions(Type)`
(2019, English), `Bemaßungen` / `Bemaßungen(Type)` (2022, German),
`PSet_Revit_Dimensions` / `PSet_Revit_Type_Dimensions` (2010, both on the
element). They can be read back.

## Which property equals the stored figure

`eval/revit-door-window-params.mjs` tallies, for every door and window with a
stored `Width`, every numeric property on the element and its type that
equals the stored figure to 1e-4:

| Model | Tool | Width = the Width parameter | Height = the Height parameter | Area = W x H |
| --- | --- | ---: | ---: | ---: |
| HHS architect | Revit 2010, IFC2x3 | 129 of 133 (95 type, 34 instance) | 129 of 133 | none stored |
| ARK_NUS | Revit 2019, IFC2x3 | 568 of 568 (`Dimensions` 488, `Dimensions(Type)` 80) | 568 of 568 | 0 of 576 (`BaseQuantities`) |
| kleine Wohnung | Revit 2022, IFC4 | 99 of 99 (`Breite`) | 99 of 99 (`Höhe`) | 99 of 99 |

The "Rough Width" / "Rohbaubreite" properties often equal the same figure,
but not always; the plain `Width`/`Breite` always does when anything does.

## The rule

`revitSizeLines` / `addRevitSizeLines` in `geometry-quantities.mjs`, run by
`measureModel` (so `cli.mjs --fill ... --from-geometry`, the page's checkbox
and the worker):

- Only Revit exports (the owner history's application, or the file's only
  one).
- `Width` and `Height` from a length-typed `Width`/`Breite` and
  `Height`/`Höhe` property in a dimensions set (`Dimensions`, `Bemaßungen`,
  `Abmessungen`, with or without `(Type)` or the 2010 `PSet_Revit_` and
  `PSet_Revit_Type_` prefixes), on the element or its type. The instance's own
  set wins over a type set, as in the exporter. Both are needed or neither is
  offered.
- `Area` = W x H, in IFC4 and later files only (the exporter's `Qto_` rule;
  the IFC2x3 `BaseQuantities` Area Revit 2019 stored is not W x H on any of
  576).
- `Perimeter`: never (the exporter's is the body's outline).
- Other languages' group names (French, Norwegian, ...) are not matched: no
  public export to check them against. A German or English export is.
- ARCHICAD's opening rule is unchanged and runs first.

## Against every stored figure

`node --max-old-space-size=7000 eval/revit-door-window-quantities.mjs ... --json eval/revit-door-window-quantities-2026-11-22.json`
(`eval/revit-door-window-quantities-2026-11-22.txt`):

| Model | Width offered / exact | Height offered / exact (within 2%) | Area offered / exact |
| --- | ---: | ---: | ---: |
| HHS architect (2010) | 133 / 129 | 133 / 129 (133) | 0 (IFC2x3) |
| ARK_NUS (2019) | 568 / 568 | 568 / 568 | 0 (IFC2x3) |
| kleine Wohnung (2022) | 99 / 99 | 99 / 99 | 99 / 99 |

**800 widths and 800 heights offered, 796 of each exact; 99 of 99 areas
exact.** The 4 misses are the same 4 HHS doors (`Drehflügel 1-flg -
Stahlzarge 88.5 x 2.26`): their stored 0.9339 x 2.2845 m is the steel frame's
outer size, about 0.885 + 2 x 0.0245 by 2.26 + 0.0245, which no exported property
carries; the rule writes the 0.885 x 2.26 nominal size, 5.2% and 1.1% under.
That is the one known way the rule goes wrong: a 2010 family that put the
frame into its stored quantities. ARK_NUS also gets 8 doors and windows
filled that stored no Width.

## The fill end to end

`eval/door-window-quantities-fill.mjs` (stored Width/Height/Area/Perimeter
renamed, the fill asked for all four with `--from-geometry`;
`eval/revit-door-window-quantities-fill-2026-11-22.txt`):

| Model | Written | Re-read pass | Within 2% of the hidden figure |
| --- | ---: | ---: | ---: |
| kleine Wohnung | 297 | 297 | 297 of 297 |
| HHS architect | 266 | 266 | 262 of 266 (the 4 frame widths) |

IfcTester 0.9.0 with IfcOpenShell 0.9.0.post1
(`eval/revit-door-window-quantities-ifctester-2026-11-22.txt`): kleine
Wohnung's 47 doors and 52 windows go from 0 to all passing on Width, Height
and Area; HHS's 133 doors on Width and Height. Perimeter stays with the
to-fill table for both, as designed.

Before this, the same runs wrote 0 values on these files.

## What is left

- Perimeter for Revit: the body's outer outline in the exporter; it needs a
  check against an export that stores it (none of the three does).
- Group names in other Revit languages, when a public export in one turns up.
- Doors and windows from other tools that store the sets (Tekla, Allplan,
  Vectorworks): none public yet.
