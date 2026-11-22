# Revit openings written as breps: quantities from their faces (2026-11-22)

**Question.** The model fill's opening quantities
(`eval/opening-quantities-2026-11-22.md`) read an opening's extrusion. Revit
2022 writes 102 of kleine_Wohnung's 168 openings as an `IfcAdvancedBrep`,
and those got nothing: an IDS asking for `Qto_OpeningElementBaseQuantities`
left 408 values in the to-fill table, and the filled model failed. What are
those bodies, what should their Width, Height, Depth and Area be, and how
can that be checked when Revit stores no figures on them?

## What the breps are

`ThatOpen/engine_web-ifc` `tests/ifcfiles/public/ISSUE_159_kleine_Wohnung_R22.ifc`
(Autodesk Revit 2022 DEU; a blob-less sparse clone, not committed). The
house's outer walls are modelled as two walls: 0.24 m of masonry
(`Ziegel 0.24 m`) and a separate 0.16 m insulation wall
(`WDVS_0160 ... EPS_0160`). Every window cuts both, and Revit writes each cut
as one brep spanning both layers:

- 50 cuts in the masonry wall, each filled by its window
  (`IfcRelFillsElement`), and 52 twins in the insulation wall, filled by
  nothing;
- each is two stacked boxes, 11 faces: the window's full size (1.65 x
  2.35 m for a `FE_TUER_2-tlg` door-window) through the first 0.24 m, then
  1.59 x 2.15 m (30 mm in at each side and the top, 170 mm up at the
  bottom) through the next 0.26 m: the reveal through the insulation;
- Revit stores no quantities on any of them. Its 66 extrusion openings (47
  doors, 17 slab cuts, 2 more wall cuts) store the set.

## The reading

`openingBodyLines` in `geometry-quantities.mjs`, run by
`addOpeningElementQuantities` for a Revit 2019-on or 2010 opening whose body
has any item other than an extrusion:

- **through**: a horizontal face normal t such that every face is parallel
  or square to t (a box, a stepped box or a round cut qualifies; a skewed
  face does not, and offers nothing). A box gives two candidates; take the
  one nearest the host wall's thickness direction.
- **the host's thickness direction** (`hostThickness`): square to the wall's
  straight `Axis`, or with none, the horizontal normal its body is thinnest
  across, turned from the wall's own placement axes into world axes. Two
  slips found on the way: reading the host body's normal without that turn
  sent 44 of the 102 through the wall's length; and "thinnest" alone fails on
  ARK_NUS's 0.33 m long, 0.41 m thick wall stubs (68 openings in the first
  check below), which the Axis avoids.
- **Width, Height**: the body's upright extent and its extent across t on
  the level, assigned as the same Revit version's extrusions assign them
  (2019 on: Width upright; 2010: Width across).
- **Depth**: the extent along t (Revit's own Depth is its cutter's length,
  10 ft for an ARK_NUS window, not the wall's thickness).
- **Area**: the largest face square to t (a stepped cut's outer section, a
  plain cut's profile), offered only if it fits the section box.

```
node eval/opening-brep-quantities.mjs kleine_Wohnung ARK_NUS --json eval/opening-brep-quantities-2026-11-22.json   # opening-brep-quantities-2026-11-22.txt
node eval/opening-quantities-fill.mjs kleine_Wohnung --out OUT                          # opening-brep-quantities-fill-2026-11-22.txt
python3 eval/model_fill_ifctester.py OUT OUT/hidden/*.ifc   # IfcOpenShell 0.9.0.post1, IfcTester 0.9.0; opening-brep-quantities-ifctester-2026-11-22.txt
```

## Check 1: the same reading where Revit did store figures

Run on every Revit 2019-on wall opening that stores the set (all
extrusions: kleine_Wohnung, ARK_NUS; their own reader stays
`openingElementLines`), treating each as if it were a brep:

| Figure | Stored | Read | Within 1% |
| --- | ---: | ---: | ---: |
| Depth | 738 | 738 | **738** |
| Width and Height as a pair | 824 | 824 | **824** (662 in Revit's order, 162 swapped) |
| Area | 1 | 1 | 1 |

All 162 swapped pairs are ARK_NUS (Revit 2019) wall openings whose
profile's x side the exporter left across rather than upright (the earlier
eval's 186 of 775). Revit 2022's 49 wall openings all store Width upright,
the order the reading uses: 49 of 49.

## Check 2: the brep openings against their windows

What `measureModel` now offers on the 102 breps, against the filling
window's own Revit Width and Height (`addRevitSizeLines`, the family's
size parameters). An insulation-wall twin is compared with the window whose
own cut sits beside it (section-box centres under 1 m apart, same top within
1 cm):

| Openings | Offered | Width = window's Height | Height = window's Width | Area = W x H |
| --- | ---: | ---: | ---: | ---: |
| 50 filled by a window | 50 | **50** | **50** | 50 |
| 52 twins in the insulation wall | 52 | **52** | **52** | 52 |

All within 0.1%. Depths: 0.50 m (40 door-windows) and 0.62 m (62 windows),
each longer than the two walls' 0.40 m together.

## End to end

The opening IDS (`eval/opening-quantities/opening-quantities.ids.xml`, the
four on every `IFCOPENINGELEMENT`) filled with `--from-geometry` on
kleine_Wohnung with its stored figures hidden: **672 values written, was
264**; the 130 stored figures land where they were; the filled model passes
every check (was 408 values left in the to-fill table). IfcTester opens the
filled file and takes exactly the 672 written values from failing to
passing, none newly failing.

## Limits

- One public file has brep openings with a Revit convention. Its 102 are all
  stepped boxes in two axis-aligned walls; a slanted, arched or round brep
  cut has not been seen in a real export.
- Revit stores nothing on these openings, so no figure is "what Revit
  writes". The order follows Revit 2022's own extrusions in the same file,
  and the sizes are each window's.
- Vertical (floor and roof) brep openings are not read: no public export has
  one, and Revit's Width there is a profile's y side, which a brep lacks.
- Depth here is the brep's full run through both walls. For the twin in
  the 0.16 m insulation wall that is 0.50 or 0.62 m, as Revit's own extrusion
  Depths overrun their walls (3.048 m through 0.5 m in ARK_NUS).
