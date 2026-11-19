# Measure types from bSDD units (2026-11-19)

What was built: `bsdd-units.mjs` and `schema/bsdd-units.json`. `--from-bsdd`
(bsdd-spec.mjs) used to write every bSDD "Real" outside a standard set as
`IFCREAL`. It now writes the IFC measure the property's unit names, with its
values and bounds in SI, and the bSDD link check (bsdd.mjs, `--bsdd`) reads
such a facet's values against bSDD's in the property's unit.

## Why IFCREAL was wrong

IDS compares a property's IFC type exactly, and compares a measure in SI.
`node eval/bsdd-units-model.mjs` writes one bSDD-style class (a wall
thickness in mm, 50 to 400, required) as an IDS three ways and checks
`samples/tiny-house.ifc` (project length unit mm) with three walls classified
that way: W-01 holds `IfcLengthMeasure(200.)`, W-02 `IfcLengthMeasure(500.)`,
P-01 `IfcReal(200.)`. Output: `eval/bsdd-units-model.txt`.

| IDS | fails, this checker | fails, IfcTester 0.9.0 |
| --- | --- | --- |
| before: IFCREAL, 50 to 400 | W-01, W-02 (type) | W-01, W-02 |
| measure, bounds left in mm | W-01, W-02, P-01 | W-01, W-02, P-01 |
| after: IFCLENGTHMEASURE, 0.05 to 0.4 | W-02 (too thick), P-01 (type) | W-02, P-01 |

Before, the wall stored the way IFC stores a thickness failed, and only a plain
number could pass. Writing the type without converting the bounds fails every
wall: 200 mm reads as 0.2 m. With both, the 200 mm wall passes and the 500 mm
one fails. IfcTester agrees on all 9 verdicts (`eval/bsdd-units-ifctester.py`).

## The unit table

`node schema/gen-bsdd-units.mjs BSDD_UNITS.json QUDT_UNIT.ttl` joins bSDD's
unit list (`GET /api/Unit/v1`: 616 codes, 417 with a QUDT link) to QUDT's
units (`https://qudt.org/vocab/unit/`, Turtle, CC BY 4.0): conversion
multiplier, offset, dimension vector, quantity kinds. 275 bSDD codes resolve
to 272 QUDT units.

One bSDD link is wrong: `°` is named "grad (angel degree)" (German *Grad*,
degree) and linked to QUDT `GRAD`, the gon (π/200 rad, 0.0157). Read as
linked, 90° would be written as 1.414 rad instead of 1.571. The generator
relinks it to `DEG` and says so in the file (`relinked`).

## Two faults in the first mapping, found by the inventory

`node eval/bsdd-units-corpus.mjs DIR` reads every cached class answer.
The first version picked a measure from the first QUDT kind that names one:

- `dB` became IFCSOUNDPOWERLEVELMEASURE on 254 properties. QUDT's DeciB is
  both SoundPowerLevel and SoundPressureLevel, and these properties (CEN/TC
  126 Building Acoustics, LA_Fmax_nT and the like) are pressure levels. A
  dimensionless unit naming two measures now names none.
- `m³` became IFCSECTIONMODULUSMEASURE, `Pa`/`kPa`/`MPa`
  IFCMODULUSOFELASTICITYMEASURE: QUDT lists those kinds next to Volume and
  ForcePerArea. A kind now picks the other measure only when the unit names
  none of the general kinds (`N·m`, only Torque, is IFCTORQUEMEASURE).

## On bSDD (cache of 2026-11-19)

Output: `eval/bsdd-units-corpus.txt`. Real class properties outside the IFC
dictionary and outside `Pset_`/`Qto_` sets, in every class answer the corpus
runs cached: 1,625 in 22 dictionaries; 1,305 have a unit, 838 a dimension.

- **867 get an IFC measure** (18 of 22 dictionaries), 745 with one SI factor
  (the rest list two units of one measure, `mm, m`, or only a dimension: the
  type is written, and a value is written only if it can be put in SI).
  Most: length 243, pressure 165 (`N/mm²` strengths), energy 102 (`MJ` in
  LCA), mass 87, density 39.
- **758 stay IFCREAL**, each for a reason said on stderr: 304 dimensionless
  (`dB` 265, `%`), 221 no unit or dimension, 214 a unit not in bSDD's list
  (LCA impact units `kg CO2 eq`, `mol H+ eq`; `unitless`; `W/mK` and
  `W/m²K` misspelt for `W/(m·K)` and `W/(m²·K)`), 11 a unit against the
  property's own stated dimension, 8 a dimension no IFC measure has.
- **Stated dimension against the unit:** 424 agree, 37 differ. The differing
  ones are the dictionaries' data: CEN/TC 126's SERVICE_EQUIPMENT levels in dB
  carry "dimensions" 1, 2, 3 ... 11 0 0 0 0 0 0 (a counter in the length
  slot), percentages given a length or mass dimension, a point load in N given
  the dimension of a pressure. Where they differ, the facet stays IFCREAL.

Generated files, the same 188 classes in 43 dictionaries with and without the
unit table (`node eval/bsdd-spec-corpus.mjs --cache DIR [--no-units]`;
output `eval/bsdd-spec-corpus-units.txt`):

| | without units | with units |
| --- | --- | --- |
| own-set property facets typed as a measure | 1 | 454 |
| own-set property facets typed IFCREAL | 992 | 545 |
| files with no audit error | 39 of 43 | 39 of 43 |
| files with no bSDD link error / warning | 43 / 42 of 43 | 43 / 42 of 43 |

The 4 files with an audit error are the dictionaries' own faults listed in
eval/bsdd-spec-2026-11-19.md. Facet totals differ by 10 between the two runs
because a few class answers were refetched between them.

## A third fault: the link check

The first corpus run with units drew 18 new `bsdd-value` warnings on the
thermal-insulation dictionary: compressive stresses listed in kPa (`100`)
and now written in Pa (`100000`) were compared with bSDD's literal values.
`checkBsdd(..., { units })` now also accepts a measure facet's allowed value
in SI; the CLI and the corpus pass the table. 18 to 0.

## Limits

- No real model was checked against a generated IDS; the model check above
  is one built case, read the same by IfcTester.
- `%` stays IFCREAL: an IFC ratio measure takes 0.5 for 50 %, and nothing in
  bSDD says whether the dictionary means 0.5 or 50.
- `dB` stays IFCREAL; the property's name (LA_Fmax_nT) or its physicalQuantity
  could say pressure or power level, not read yet.
- Integer properties with a unit are left as IFCINTEGER.
