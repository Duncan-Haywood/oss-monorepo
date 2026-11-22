# Columns', beams', members' and piles' surface areas from their bodies (2026-11-22)

**Question.** Coating, galvanising and fire protection are priced per square
metre of steel, so steel and precast IDS files ask each linear member for
`Qto_BeamBaseQuantities` (and the Column, Member and Pile sets)
`OuterSurfaceArea` ("the total area of the extruded surfaces ... not taking
into account the end cap areas", normally perimeter x length) and
`GrossSurfaceArea` (perimeter x length + 2 x cross section). Across the 30
models in `ThatOpen/engine_web-ifc` `tests/ifcfiles/public/`, these were the
most-stored `Qto_` names the model fill could not yet measure: 2,740
`OuterSurfaceArea` and 460 `GrossSurfaceArea` figures on beams, columns and
members, from ARCHICAD, Tekla and Revit exports. Can the body give them, and
which figure does each exporter store?

## What changed

- `memberSurface(row, solidExtent, convention)` in `geometry-quantities.mjs`,
  run by `addMemberLines`, so the CLI's `--from-geometry`, the page checkbox
  and the worker all get it. Read only on a straight member with square ends
  (`memberLength`: extent along the axis = volume / section, and longer than
  wide):
  - **extruded body** (signed convex pieces): side faces = the section's
    outline at mid-length (`sectionPerimeter`) x the length;
  - **faceted body**: the area of the faces whose normal is square to the
    axis, accepted only when the faces left over are the two end caps (their
    area within 1% of twice the section); otherwise none (M3D-CON's 31 Tekla
    braces, whose takeoff axis is off the brace);
  - **hollow section**: `innerTerms` finds negative pieces whose section lies
    wholly inside a positive piece without touching its edges (a tube's
    bore, not a notch); the outline without them is the outside.
- The figure offered, by the application the owner history names:

| Tool | OuterSurfaceArea | GrossSurfaceArea | Tube |
| --- | --- | --- | --- |
| ARCHICAD | side faces | side + both ends | held back |
| Revit | side faces | none (it stores the side figure again) | held back |
| Tekla | side + both ends | side + both ends | outside faces only, both names |
| other | side, only when the ends are under 2% of the total | side + both ends | held back |

- Tests (`geometry-quantities.test.mjs`): a bar under each convention, a
  stubby bar (Outer held back for an unknown tool), cut ends and a plate
  (none); a square tube's bore found and left out by Tekla's convention and
  held back by ARCHICAD's, a notch not taken for a bore; a faceted bar, and
  one whose leftover faces are not two caps; the fill on the sample office's
  IPE 200 beam (0.768 m2/m, the section tables' figure, x 4 m) and its round
  column (Gross only).

## Setup

`ThatOpen/engine_web-ifc` `tests/ifcfiles/public/` (blob-less sparse clone,
not committed). Every file was run; seven store one of the two names on a
linear member: AC20-FZK-Haus and ISSUE_005_haus (ARCHICAD GER),
schependomlaan (ARCHICAD NED), ISSUE_021_Mini Project, ISSUE_102_M3D-CON and
ISSUE_102_M3D-CON-CD (Tekla), ISSUE_068_ARK_NUS_skolebygg (Revit 2019).

```
node eval/member-surfaces.mjs DIR/*.ifc --json eval/member-surfaces-2026-11-22.json   # member-surfaces-2026-11-22.txt
node eval/member-surfaces-fill.mjs <the seven> --out OUT                              # member-surfaces-fill-2026-11-22.txt
python3 eval/member_surfaces_ifctester.py OUT                                         # member-surfaces-ifctester-2026-11-22.txt
```

## How the conventions were found

Before any rule, each stored figure was set against the side-face area and
the total area of the same body, per tool:

- ARCHICAD square-ended members: Outer = side 36 of 43, Gross = total 43 of
  43; faceted: Outer = side 90 of 103, Gross = total 102 of 103.
- Tekla: Outer = total 952 and side 269 (long members, where the two are
  within 2% of each other) of 1,301 linear square-ended members; Gross = total
  228 of 228. The 22 lifting eyes (`HIJSOOG DIAM.60`, a hollow circle) stored
  half the side figure: their bore had been counted, Tekla counts only the
  outside.
- Revit (ARK_NUS): Outer = side x 1,000,000 on 18 of 18 and Gross the same
  figure again: the exporter wrote mm2 under the file's m2 unit, the same
  slip as its litre volumes in `eval/space-quantities-2026-11-22.md`. Two of
  the 18 are linear members; the other 16 are panels extruded through their
  thickness, which the length test leaves out.

## Results (stored figures read against the offered ones)

| Tool and name | stored | offered | within 2% | other misses | no straight square-ended reading |
| --- | ---: | ---: | ---: | ---: | ---: |
| ARCHICAD GrossSurfaceArea | 146 | 114 | 114 | 0 | 32 |
| ARCHICAD OuterSurfaceArea | 146 | 114 | 106 | 8 | 32 |
| Revit GrossSurfaceArea | 18 | 0 | | | 16 |
| Revit OuterSurfaceArea | 18 | 2 | 0 (2 off only by mm2 under m2) | 0 | 16 |
| Tekla GrossSurfaceArea | 296 | 296 | 284 | 12 | 0 |
| Tekla OuterSurfaceArea | 2,576 | 1,428 | 1,373 | 55 | 1,148 |

Offered: 1,479 of 1,544 Outer and 398 of 410 Gross within 2% of the stored
figure. The misses, by part:

- 40 Tekla `TRIMEX` tube pieces (20 and 30 mm, 0.2 m): stored 0.012 and 0.009
  against 0.0126 and 0.0094 written; the stored figures are rounded to three
  decimals, which these 0.01 m2 parts cannot survive.
- 12 Tekla `BALK` beams: each stored figure is 0.2016 m2 above the reading,
  a constant no face of the body explains.
- 12 Tekla `PLT-E` plates exported as beams (M3D-CON-CD): Gross stored
  121.29 against 145.04; Outer on the same parts matches.
- 8 ARCHICAD `stripstaal 80/8` flat strips: Outer stored 0.0992 against
  0.1091 (9%); Gross on the same parts matches.
- 3 Tekla `KOKER`/`OPLASSTUK`: 2-4% off.

The 1,148 Tekla rows with no reading are mostly plates exported as beams (747
no longer than wide) and cut or bent members.

## The fill end to end

With both names hidden (renamed `...AsExported`) the fill, asked for both on
every beam, column, member and pile, writes 4,041 values on the seven models:
8, 8, 2,680, 0, 176, 893 and 276. Every one passes the fill's own re-read, and
IfcTester 0.9.0 takes exactly the written elements from fail to pass on
every specification (Mini Project: 1,104 beams, 8 columns, 228 members;
ARK_NUS: 893 Outer, no Gross; M3D-CON-CD's 68 piles both names).

## What is left

- Revit and ARCHICAD tubes: no public export stores a figure for one.
- Cut ends: a mitred member's side area is not the outline x one length;
  Tekla's 26 stored figures on cut members split 15/11 between readings, so
  none is offered.
- Tekla's 0.2016 m2 on `BALK`, and its plate-as-beam Gross figure.
- `NetSurfaceArea` (openings taken off) and `Qto_*BaseQuantities`
  `NetWeight`/`GrossWeight` (Tekla stores 2,450 weights; they need the
  material's density, which IFC carries only sometimes).
