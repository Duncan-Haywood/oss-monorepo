# A door's and window's base quantities from the opening it fills (2026-11-22)

**Question.** The model fill writes missing `Qto_` quantities measured from
the geometry (`eval/qto-from-geometry-2026-11-21.md`): walls, slabs, members.
Doors and windows got nothing beyond a volume, so an IDS asking for
`Qto_DoorBaseQuantities` or `Qto_WindowBaseQuantities` `Width`, `Height`,
`Area` and `Perimeter` (the four figures a door and window schedule, a
glazing takeoff or an energy model reads) sent every door and window to the
to-fill table. Which source gives the figures the exporters store: the
element's `OverallWidth`/`OverallHeight` attributes, its body, or the opening
it fills? And do the exporters agree with each other?

## What changed

- `openingLines` / `addOpeningLines` in `geometry-quantities.mjs`: each door
  and window that fills exactly one opening (`IfcRelFillsElement`) has the
  opening's body taken into the element's own placement, where x is the width
  and z the height (as `OverallWidth`/`OverallHeight` are defined). The
  readings are the opening's extent along x and z, its section across y (the
  wall's thickness) and the bounding rectangle's perimeter.
- Offered only for ARCHICAD exports (owner history, or the file's only
  application), the one tool whose convention the public models show
  consistently: `Width` and `Height` the opening's, `Area` the opening's own
  section (a round window's pi/4 m2, not 1 m2), `Perimeter` 2 (W + H), the
  bounding rectangle's even for a round window. Also held back: an opening
  several elements fill, and an opening more than 1% off the element's own
  `OverallWidth`/`OverallHeight`.
- `measureModel` runs it, so `cli.mjs --fill ... --from-geometry`, the page's
  checkbox and the worker all get it.
- Tests (`geometry-quantities.test.mjs`): a rectangular and a round opening
  under ARCHICAD's convention, nothing offered for another tool or an opening
  far larger than the window; the fill on the sample office's 1000 x 2100 mm
  door opening with a smaller leaf inside (the opening's figures written, not
  the leaf's); a Revit door and an opening two elements fill offering none.

## Setup

`opensourceBIM/IFC-files` at `cb96c50` (HHS Office architect, Revit 2010) and
`ThatOpen/engine_web-ifc` at `5ba2467`, `tests/ifcfiles/public/`, sparse
clones as in `eval/member-lengths-2026-11-22.md`. IfcOpenShell 0.9.0.post1,
IfcTester 0.9.0 (pip).

```
node --max-old-space-size=7000 eval/door-window-quantities.mjs MODEL.ifc ... --json eval/door-window-quantities-2026-11-22.json   # > door-window-quantities-2026-11-22.txt
node --max-old-space-size=7000 eval/door-window-quantities-fill.mjs MODEL.ifc ... --out DIR                                          # > door-window-quantities-fill-2026-11-22.txt
python3 eval/door_window_quantities_ifctester.py DIR                                                                                 # > door-window-quantities-ifctester-2026-11-22.txt
```

## 1. Which source the exporters measured

Every stored figure on doors and windows in the seven public exports that
store any (`eval/door-window-quantities-2026-11-22.txt`, "Opening read" and
"OverallWidth/Height" columns), the opening's reading whether offered or not:

| Model | Tool | Stored W / H | Opening W exact | Opening H exact | Opening Area exact | Attributes W / H within 2% |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| AC20-FZK-Haus | ARCHICAD | 16 / 16 | 16 of 16 | 16 of 16 | 16 of 16 | 16 / 16 |
| ISSUE_005_haus | ARCHICAD | 16 / 16 | 16 of 16 | 16 of 16 | 16 of 16 | 16 / 16 |
| C20-Institute | ARCHICAD | 283 / 283 | 283 of 283 | 283 of 283 | 283 of 283 | 283 / 283 |
| schependomlaan | ARCHICAD | 169 / 169 | 70 of 74 | 70 of 74 | 66 of 74 | 91 / 91 of 169 |
| HHS architect | Revit 2010 | 133 / 133 | 95 of 99 | 95 of 99 | (none stored) | 129 / 133 of 133 |
| ARK_NUS | Revit 2019 | 568 / 568 | 9 of 537 | 9 of 537 | 0 of 537 | 229 / 548 of 568 |
| kleine Wohnung | Revit 2022 | 99 / 99 | 97 of 97 | 50 of 97 | 31 of 97 | 97 / 50 of 99 |

- **ARCHICAD measures the opening.** On FZK-Haus, haus and C20, all four
  figures equal the opening's on every element, 315 of 315. Its two round
  windows (FZK-Haus `OG-Fenster`, 1 x 1 m) store `Area` 0.7851 m2, the
  circle's, and `Perimeter` 4.0 m, the bounding square's: the opening's
  section gives the first, 2 (W + H) the second. W x H would have been 1 m2,
  27% high.
- **Revit has no one rule.** Revit 2010 (HHS) stores `OverallWidth` and
  `OverallHeight`, and 4 doors (`Stahlzarge 88.5 x 2.26`) store 0.9339 m, a
  width neither the attributes (0.885) nor the opening give. Revit 2019
  (ARK_NUS) stores neither: `IDT 10x21M` doors store 0.99 m in a 1.01 m
  opening, `V22 14x14` windows 1.39 m in a 1.42 m one, and `Area` is larger
  than W x H (2.86 m2 on a 1.42 x 1.42 m window). Revit 2022 (kleine Wohnung)
  stores the opening's width, the opening's height on windows (1.35 m where
  `OverallHeight` says the frame's 1.365 m) and on doors the leaf's nominal
  height, 2.05 m (the type's `Rohbauhöhe`), in a 2.15 m opening. Any one rule
  would write wrong figures into one of the three, so Revit gets none.
- **The attributes are not the answer either.** They match ARCHICAD (it
  writes the opening's size into them) but on Revit 2022 miss 49 of 99
  heights and on Revit 2019 339 of 568 widths.
- No public export from another tool stores the sets (Tekla, IfcOpenShell,
  the unnamed HouseZ), so other tools get none.

## 2. What is offered, against every stored figure

| Model | Offered | Width exact | Height exact | Area exact | Perimeter exact |
| --- | ---: | ---: | ---: | ---: | ---: |
| AC20-FZK-Haus | 16 | 16 | 16 | 16 | 16 |
| ISSUE_005_haus | 16 | 16 | 16 | 16 | 16 |
| C20-Institute | 283 | 283 | 283 | 283 | 283 |
| schependomlaan | 65 | 65 | 62 | 62 | 62 |

**380 elements offered, every figure within 2% of the stored one, 377 to 380
exact** (to 1e-4). schependomlaan's other 3 are within 2%. Its 4
`merk J`/`merk Jsp` windows are held back by the attribute check: 0.9 x 1.5 m
windows in a 1.53 x 2.637 m opening, storing a 0.30 m `Width` and 0.79 m2
`Area`, which no reading reproduces. Of its 464 doors and windows only 74
fill an opening at all; the rest are placed in walls with no
`IfcRelFillsElement`, so they get nothing.

## 3. The fill end to end

With every stored `Width`, `Height`, `Area` and `Perimeter` quantity renamed,
the fill asked for the four on every door and window
(`door-window-quantities/door-window-quantities.ids.xml`, 8 specifications)
with `--from-geometry` (`eval/door-window-quantities-fill-2026-11-22.txt`):

| Model | Written | Re-read pass | With a stored figure | Within 2% |
| --- | ---: | ---: | ---: | ---: |
| AC20-FZK-Haus | 64 | 64 | 64 | 64 |
| ISSUE_005_haus | 64 | 64 | 64 | 64 |
| C20-Institute | 1,132 | 1,132 | 1,132 | 1,132 |
| schependomlaan | 260 | 260 | 260 | 260 |
| ISSUE_126_model (ARCHICAD) | 68 | 68 | 0 | |
| S_Office (ARCHICAD) | 236 | 236 | 0 | |
| kleine Wohnung (Revit) | 0 | | | |

**1,824 values written, 1,824 pass the fill's re-read, 1,520 of 1,520 with a
stored figure match it.** IfcTester
(`eval/door-window-quantities-ifctester-2026-11-22.txt`) takes exactly the
written elements from fail to pass on every specification: FZK-Haus and haus
16 of 16, C20 283 of 283, schependomlaan 65 of 464, ISSUE_126 17 of 29,
S_Office 59 of 65, kleine Wohnung 0 of 99 (Revit, held back).

## What is left

- A Revit rule, if a later Revit export settles one (the exporter's source
  is open: the Revit IFC exporter's door and window quantity code would say
  which parameter it reads per version).
- Doors and windows with no `IfcRelFillsElement`: the body's own extent would
  be the next source, but it includes casings and sills (a Revit door's body
  is 0.14 m wider than its opening), so it needs its own check.
- An export from another tool that stores the sets.
