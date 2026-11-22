# Wall Length and Height for brep walls and walls with no Axis (2026-11-21)

**Question.** The axis check earlier today (`wall-axis-lengths-2026-11-21.md`)
measured wall `Length` and `Height` only for walls with a straight `Axis`
representation and a body of extruded convex pieces. It left out walls whose
body is a faceted brep or tessellation (HHS construction's 12, for example)
and walls with no `Axis` at all (ISSUE_034 HouseZ: 140 walls, nothing
offered). Can those be measured with the same guarantees: a value only where
it can be trusted, and every written value passing here and in IfcTester?

## What changed (`geometry-quantities.mjs`)

- **Faceted bodies.** A body with closed shells is taken as convex pieces by
  the takeoff's own `asTerms` (a convex shell is one piece; any other is a
  signed fan of tetrahedra whose signs add up to the shell's inside), so the
  same middle-plane line test reads it. The material's extents come from the
  shells' own vertices, not the fan's centre.
- **Height on a faceted body.** A brep has no extrusion left: a roof's or
  slab's cut is already in its faces, and exporters disagree on clipped walls
  (Revit stores the unclipped depth, ARCHICAD the clipped tallest point). So a
  faceted wall's Height is offered only when its top is **level along the
  whole wall** (the top of every vertical line on the middle plane, a hair in
  from the ends, within 0.5% of the highest point), where the two readings
  are one figure. Otherwise the row goes to the to-fill table.
- **No Axis.** The direction is read from the body: perpendicular to the
  horizontal face normal the body is thinnest across (the takeoff's side
  plane, `computed.areas.side.n`; `bodyDirection`). `computed.lines.from`
  records `axis` or `body`.
- **Guard for bodies that are not one straight wall.** An L-shaped body's
  middle line runs through one arm only (a 5 m corner wall read as 0.3 m), so
  a length shorter than the body is thick is not offered. This also drops 4
  walls the axis path measured before (3 on ISSUE_129, 1 on Schultz); none of
  the 492 walls with a stored Length is affected.

## Setup

The same 15 public models as the axis check (fetch steps there).

```
node --max-old-space-size=7000 eval/wall-brep-lengths.mjs MODEL.ifc ... --json eval/wall-brep-lengths-2026-11-21.json
node eval/model-fill-sweep.mjs MODEL.ifc eval/wall-axis-lengths OUT/<model> --write 1 --modes geometry
python3 eval/model_fill_ifctester.py OUT/<model> MODEL.ifc     # IfcOpenShell 0.9.0.post1, IfcTester 0.9.0
```

Output: `wall-brep-lengths-2026-11-21.txt` and `.json`; fill lines:
`wall-axis-lengths/fill-brep-2026-11-21.jsonl`. `eval/wall-axis-lengths.mjs`
now passes `bodyDirection: false`, so it still measures what its report
describes; rerun, its stored-length lines are unchanged.

## 1. Coverage

| | Walls measured | Heights offered |
| --- | ---: | ---: |
| Before (axis, extruded only) | 2,955 of 3,312 | 2,929 |
| Axis, extruded (after the L guard) | 2,951 | 2,925 |
| Axis, faceted (new) | 62 | 22 |
| No axis, extruded (new) | 95 | 95 |
| No axis, faceted (new) | 139 | 91 |
| **After** | **3,247 of 3,312** | **3,133** |

HouseZ goes from 0 to 134 of 140 walls (130 faceted). The 65 walls still
unmeasured across the 15 models: 48 with no body read (40 on S_Office, 8 on
ISSUE_126), 13 faceted bodies whose faces are not all known (6 on HouseZ, 4
on Schultz, 3 on dental_clinic), and the 4 L-shaped ones above.

## 2. Held out: the new paths on walls whose answer is known

None of the newly measured walls stores a `Qto_` Length or Height, so the
new paths were run on the 492 walls that do (the five models in the axis
check), with the axis ignored:

| Path | Lengths | Same as the axis reading | Within 2% of stored | Heights offered | of those within 2% |
| --- | ---: | ---: | ---: | ---: | ---: |
| Axis (the shipped reading) | 492 | - | 465 | 476 | 476 |
| Direction from the body | 492 | **492** | 465 | 492 identical extrusion depths | - |
| Direction from the body, pieces handed over as closed shells and every shell fanned into tetrahedra | 492 | **492** | 465 | **419** (level top) | **419** |

- The body's side faces give the same direction as the axis on every one of
  the 492 walls, so the length is identical to the last decimal.
- Read the way a non-convex brep is read (all fanned), the length is again
  identical on 492 of 492. The level-top rule offers 419 heights, all 419
  within 2% of the stored figure; the 73 it holds back are walls a roof, a
  slab or a notch cuts (on kleine_Wohnung: walls with 1 to 3 negative pieces
  in their top), where a brep cannot tell the exporters' two readings apart.

## 3. Against Revit's own length

Revit exports also write the wall's location-line length into a set of their
own (`PSet_Revit_Dimensions` Length; French `Cotes` Longueur), on walls with
no `Qto_` set too. It is a weaker reference: it runs between join points, so
on the walls the shipped axis path measures it agrees within 2% on 876 of
1,958, and a further 503 differ by halves or wholes of joined walls'
thicknesses (70% together).

| Path | Revit walls | within 2% | join-thickness difference | together |
| --- | ---: | ---: | ---: | ---: |
| Axis, extruded (shipped) | 1,958 | 876 | 503 | 70% |
| Axis, faceted | 56 | 22 | 8 | 54% |
| No axis, extruded | 91 | 60 | 2 | 68% |
| No axis, faceted | 9 | 1 | 0 | 11% |

HHS construction's 12 faceted walls: **12 of 12** within 2%. The low rates
are ISSUE_129's tunnel walls ("IGC_MUR_EGC-TUN-VOILE"), where the body is
0.2 to 4 m shorter than Revit's figure on extruded walls of the same type too
(#8653, extruded: 6.728 m against Revit's 7.631; #5221, faceted: the same
6.728 against 7.631). The faceted reading matches its extruded twins; the gap
is between Revit's location line and the wall's body, the same question the
axis check left open (19 HHS lengths that disagree with the exporter's own
area over height). The fill writes the body's length, as it does for every
wall.

## 4. The fill with geometry on

`eval/wall-axis-lengths/wall-lines.ids.xml` (walls carry
`Qto_WallBaseQuantities.Length` and `Height`), on the seven models the new
paths reach:

| Model | Failing walls | before this change | after | Values written (measured) | Read back passing | IfcTester: fail before, pass after | newly failing |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ISSUE_034_HouseZ | 140 | 140 | **45** | 229 (229) | 229 | 229 / 229 | 0 |
| ISSUE_129 (Revit, French) | 336 | 129 | **26** | 643 (643) | 643 | 643 / 643 | 0 |
| dental_clinic | 1,080 | 17 | **13** | 2,144 (2,144) | 2,144 | 2,144 / 2,144 | 0 |
| construction (HHS) | 48 | 12 | **11** | 85 (13) | 85 | 85 / 85 | 0 |
| advanced_model | 133 | 5 | 5 | 261 (261) | 261 | 261 / 261 | 0 |
| duplex | 57 | 1 | **0** | 114 (114) | 114 | 114 / 114 | 0 |
| kleine_Wohnung_R22 | 1 | 1 | **0** | 2 (2) | 2 | 2 / 2 | 0 |
| **Total** | | **305** | **100** | **3,478 (3,406)** | 3,478 | 3,478 / 3,478 | **0** |

- **Walls left failing: 305 to 100.** Every written value reads back passing
  here and in IfcTester, nothing IfcTester passed before fails after, and the
  changed lines equal the records the fill says it added in every file.
- What is left is mostly Height: HouseZ's 45 are 39 faceted walls with a
  sloped or cut top plus the 6 unread bodies; advanced_model's 5 and HHS
  construction's 11 are faceted walls whose top a slab notches.

## What is left

- Heights of faceted walls with a cut top (HouseZ 39, HHS construction 11):
  telling the exporter's convention from the file (a Revit export: the
  unconnected height in `PSet_Revit_Constraints`) would offer one; not done.
- Curved walls (an arc axis): the middle line's arc length; no public model
  here stores one to check against.
- Why ISSUE_129's tunnel walls are shorter than Revit's location line (on
  extruded and faceted walls alike).
