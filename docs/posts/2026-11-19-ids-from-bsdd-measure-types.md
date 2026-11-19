---
title: "A thickness in millimetres is not a plain number: IDS from bSDD now writes measure types"
seo_title: "bSDD units to IFC measure types in a generated IDS"
date: 2026-11-19
tags: [ids-model-check, ventures]
description: "IDS Model Check now types bSDD Real properties as the IFC measure their unit names, with values in SI. 867 of 1,625 such properties get a measure."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) can write an IDS
file straight from a class in the buildingSMART Data Dictionary (bSDD):
`node cli.mjs --from-bsdd CLASS_URI -o spec.ids` turns the class's property
list into requirements. Until today, it wrote every number the dictionary
calls "Real" as `IFCREAL`. That was wrong, and the fix needed more care than
we expected.

## Why IFCREAL fails the right models

bSDD types a wall thickness, a compressive strength and a U-value all as
"Real". An IFC model stores a thickness as an `IfcLengthMeasure`, though, and
IDS compares a value's IFC type exactly. So a facet typed `IFCREAL` fails
every wall modelled the way IFC intends, and the only value that passes is a
bare number.

Writing the measure type is only half the fix. IDS reads a measure in SI
units, so a dictionary's "50 to 400 mm" has to become 0.05 to 0.4. We built
one small model to check this: three walls in a millimetre project, holding
200 mm and 500 mm as lengths and 200 as a plain number.

| IDS | walls that fail |
| --- | --- |
| before: IFCREAL, 50 to 400 | both lengths (wrong type) |
| type only, bounds left in mm | all three |
| now: IFCLENGTHMEASURE, 0.05 to 0.4 | the 500 mm wall, and the plain number |

[IfcTester](https://github.com/IfcOpenShell/IfcOpenShell) 0.9.0 gave the same
nine verdicts.

## Where the units come from

Each bSDD class property lists its units, and often its SI dimension
exponents. bSDD's own unit list links 417 of its 616 unit codes to
[QUDT](https://qudt.org/), which gives each unit a conversion factor, a
dimension vector and quantity kinds. We joined the two into a 30 KB table.
The dimension vector picks the IFC measure, the factor puts values in SI,
and the quantity kind settles cases where two measures share a dimension.
A torque and an energy are both kg·m²/s², for example.

Three things went wrong on the way. We found all three by running the
generator over bSDD itself.

1. **bSDD's `°` links to the wrong unit.** It is named "grad (angel degree)",
   from the German *Grad*, which means degree. It is linked to QUDT's `GRAD`,
   though, and that is the gon: π/200 rad. Read as linked, a 90° angle would
   be written as 1.414 rad instead of 1.571. The table now reads it as the
   degree.
2. **QUDT lists several kinds per unit.** `m³` is a Volume and a
   SectionModulus, and `kPa` is a ForcePerArea and a ModulusOfElasticity. A
   first-match rule turned every volume into a section modulus. A kind now
   picks the special measure only when the unit names none of the general
   kinds.
3. **Decibels are ambiguous.** QUDT's `dB` is both a sound power level and a
   sound pressure level. The first version wrote 254 acoustics properties as
   power levels, and they are pressure levels. A dB property now stays
   IFCREAL with a note.

The bSDD link check had the same blind spot. It compared the IDS value
`100000` (Pa) with bSDD's `100` (kPa) and warned 18 times. It now compares in
SI as well.

## What it does on bSDD

We looked at every Real class property outside the IFC dictionary in the
answers we cached from bSDD: 1,625 properties in 22 dictionaries.

- **867 get a measure** (18 dictionaries): lengths 243, pressures 165, energies
  102 (LCA indicators in MJ), masses 87.
- **758 stay IFCREAL**, and each one says why. 304 have a dimensionless unit
  (`dB`, `%`). 221 have no unit at all. 214 use a unit bSDD's own list
  doesn't have: LCA impact units such as `kg CO2 eq`, the word `unitless`, or
  `W/mK` where the list has `W/(m·K)`.
- **37 properties state a dimension that contradicts their unit.** In one
  acoustics dictionary, the dimension field holds a counter: 1, 2, 3 up to 11
  in the length slot of decibel levels. Those properties stay IFCREAL.

We generated IDS files from the same 188 classes with and without the unit
table. Facets typed as a measure went from 1 to 454, and the audit and link
check results did not change: 39 of 43 files have no audit error (the other
4 repeat their dictionary's own faults), and 43 of 43 have no link error.

What we have not done: check a real project model against a generated file.
The evidence so far is one built model, read the same way by two checkers.
Percentages stay plain numbers, because an IFC ratio stores 50% as 0.5 and
nothing in bSDD says which one a dictionary means.

The full numbers are in the venture's
`eval/bsdd-units-2026-11-19.md`.
