# A slab's thickness and perimeter from its body (2026-11-22)

**Question.** The model fill writes missing `Qto_` quantities measured from
the geometry (`eval/qto-from-geometry-2026-11-21.md`): volumes, areas, wall
lengths and heights, member lengths. A slab got its area and volume but not
`Qto_SlabBaseQuantities.Width` ("the total thickness of the slab") or
`Perimeter` (the outline of its profile), the two figures a formwork or
slab-edge takeoff reads. An IDS that asks for them sent every slab to the
to-fill table. Can both be measured from the body closely enough to write,
and where do the exporters disagree with each other?

## What changed

- `slabLines(row, solidExtent, convention)` in `geometry-quantities.mjs`:
  - **thickness**: the body's extent along the direction the takeoff cuts its
    plan area across (the extrusion), offered as `Width` only when the body is
    extruded;
  - **outline**: the section at mid-thickness. The takeoff holds a body as a
    signed sum of convex pieces (Revit's 46-point floor outline is 43 pieces,
    19 of them negative), so `sectionPerimeter` cuts each piece to a convex
    polygon and keeps the stretches of edge whose signed count along their
    line is not zero: an edge two pieces share cancels, a negative piece's
    edge counts against the positive one under it, a T-junction splits the
    longer edge. A faceted body gives no outline.
  - **openings**: when the body less its openings cuts a different outline,
    the Perimeter offered is the authoring tool's convention: ARCHICAD the net
    outline (openings' edges added), Revit the gross one; other tools none.
- `addSlabLines` runs in `measureModel`, so the CLI's `--from-geometry`, the
  page checkbox and the worker all get it. `quantitiesFromRows` maps
  `computed.slab` onto `Width` and `Perimeter` for `IFCSLAB` only.
- Tests (`geometry-quantities.test.mjs`): an L in two pieces meeting at a
  T-junction (16), a notch as a negative piece (18), a hole (22), a plus sign
  of two overlapping bars less their overlap (12), a faceted body (none); the
  conventions with and without openings, an opening that stops short of the
  middle, a brep slab's Width held back; the fill on the sample office's slab
  (250 mm, 18,000 mm).

## Setup

`opensourceBIM/IFC-files` at `cb96c50` (HHS Office architect and
construction, OpeningDesign Schultz Residence) and `ThatOpen/engine_web-ifc`
at `5ba2467`, `tests/ifcfiles/public/`, as in
`eval/member-lengths-2026-11-22.md`.

```
node --max-old-space-size=7000 eval/slab-width-perimeter.mjs MODEL.ifc ... --json eval/slab-width-perimeter-2026-11-22.json   # > slab-width-perimeter-2026-11-22.txt
node --max-old-space-size=7000 eval/slab-width-perimeter-fill.mjs MODEL.ifc ... --out DIR                                    # > slab-width-perimeter-fill-2026-11-22.txt
python3 eval/slab_width_perimeter_ifctester.py DIR    # IfcOpenShell 0.9.0.post1, IfcTester 0.9.0; > slab-width-perimeter-ifctester-2026-11-22.txt
```

## 1. Against every stored figure, eleven exports

`eval/slab-width-perimeter-2026-11-22.txt` (slabs whose sets store the figure;
Schultz and M3D-CON-CD store none on slabs):

| Model | Tool | Width stored | offered | within 2% | Perimeter stored | offered | within 2% |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HHS architect | Revit | 75 | 75 | 75 | 75 | 75 | 75 |
| HHS construction | Revit | 8 | 8 | 8 | 8 | 8 | 8 |
| ARK_NUS | Revit | 100 | 100 | 100 | 118 | 115 | 100 |
| kleine Wohnung | Revit | 50 | 50 | 50 | 53 | 53 | 53 |
| AC20-FZK-Haus | ARCHICAD | 4 | 4 | 4 | 4 | 4 | 4 |
| C20-Institute | ARCHICAD | 26 | 5 | 5 | 26 | 5 | 5 |
| schependomlaan | ARCHICAD | 275 | 130 | 130 | 278 | 130 | 130 |
| Mini Project | Tekla | 24 | 24 | 24 | | | |
| M3D-CON | Tekla | 55 | 0 | | | | |

- **Width: 396 offered, 396 within 2%** (all exact to the stored figure's
  digits).
- **Perimeter: 390 offered, 375 within 2%.** 13 of the other 15 are ARK_NUS
  floors split into pieces (`...:1700417` and `...:1700417:2`) that each store
  the whole floor's figure: 113.20 m + 33.14 m = 146.34 m stored on both; three
  `Fotskraperist` mats store 31.2 m, three times each one's 10.4 m. The last 2
  are ARK_NUS floors with openings whose stored figure is the net outline
  (125.34 m, 66.34 m: exactly the outline with the openings), against the
  gross outline on the other 40 Revit slabs with openings. Leaving the split
  pieces out, **375 of 377 (99.5%)**.
- Not offered: the faceted slabs (C20's 21, schependomlaan's 145, M3D-CON's
  55). Their thinnest extent is the stored thickness on 158 of 221; the misses
  are M3D-CON's `533*193` grout strips, where Tekla stores the profile's first
  dimension (0.533 m) as Width with the body 0.193 m thick, and eight
  schependomlaan pieces (sloped `sporenkap` storing 0.195 m against 0.124 m
  square to the slope; two `vloerveld` storing 0.2 m on a 0.14 m body). 71% is
  not enough to write, so they stay in the to-fill table. Every extruded slab's
  thickness was right (259 of 259 before the rule), Tekla's included.

### What decided the rules

A first version offered every slab's thinnest extent as Width, gave Tekla no
Width at all, and held back every Perimeter on a slab with openings:

- Width 530 of 538 within 2%; the 8 misses were all faceted. Holding back
  faceted bodies instead of Tekla took Mini Project's 24 Tekla slabs from held
  back (all 24 right) to offered.
- Perimeter with openings: ARCHICAD's 7 stored figures were the net outline 7
  of 7; Revit's 42 were the gross outline 40 of 42.

## 2. End to end: the fill with the stored figures hidden

Every `IFCQUANTITYLENGTH('Width'` and `('Perimeter'` renamed in eight models,
the fill asked for both on every slab
(`eval/slab-width-perimeter/slab-width-perimeter.ids.xml`) with geometry on
(`eval/slab-width-perimeter-fill-2026-11-22.txt`):

| Model | Written | Width with a stored figure, within 2% | Perimeter with a stored figure, within 2% |
| --- | ---: | ---: | ---: |
| HHS architect | 150 | 75 of 75 | 75 of 75 |
| HHS construction | 16 | 8 of 8 | 8 of 8 |
| AC20-FZK-Haus | 8 | 4 of 4 | 4 of 4 |
| C20-Institute | 10 | 5 of 5 | 5 of 5 |
| ARK_NUS | 230 | 100 of 100 | 100 of 115 |
| kleine Wohnung | 106 | 50 of 50 | 53 of 53 |
| schependomlaan | 260 | 130 of 130 | 130 of 130 |
| Mini Project | 48 | 24 of 24 | (none stored) |

- **828 written; the fill's re-read passes 828 of 828.** The 15 ARK_NUS
  perimeter misses are section 1's split floors and two net outlines.
- **IfcTester agrees**: on the hidden copies 0 slabs pass either
  specification; on the filled ones 414 pass each, 828 in all, the count
  written (`eval/slab-width-perimeter-ifctester-2026-11-22.txt`).
- ARK_NUS gets 15 Widths and Perimeters on slabs that stored none;
  schependomlaan's 149 slabs with no reading (faceted bodies) and C20's 21 go to the
  to-fill table (298 and 42 rows).

## What this does not show

- Plates, coverings and roofs: their `Qto_` sets name a Width or Perimeter
  too, but no public export here stores one in a `Qto_` or `BaseQuantities`
  set that could be checked (schependomlaan's covering figures are in
  `ArchiCADQuantities` and do not match the extent). Not offered.
- Why two Revit floors store the net outline: nothing read here separates
  them from the other 40; a second Revit model with the same split would say
  whether it is a version or a setting.
- A faceted slab's thickness: a sloped slab's figure depends on whether the
  tool measures square to the slope or vertically, and the sample is one
  ARCHICAD file.
- Perimeter of a slab whose outline has arcs: the takeoff's pieces are
  polygons, so an arc's length is its chord sum (the curve's tessellation).
  None of the stored perimeters here was off for that reason.
