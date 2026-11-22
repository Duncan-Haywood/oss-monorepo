# Qto_ NetWeight and GrossWeight as volume x density (2026-11-22)

**Question.** Steel and precast are bought, lifted and shipped by the tonne,
so structural IDS files ask beams, columns and members for
`Qto_*BaseQuantities` `NetWeight`. Earlier runs left this open
(`eval/member-surfaces-2026-11-22.md`, "What is left": "they need the
material's density, which IFC carries only sometimes"). No body defines a
weight. Can the fill write one, and where does the density come from?

## What changed

- `weights.mjs`: `memberWeights(model, rows, { densities })` gives each
  element with one material `NetWeight` = its stored `NetVolume` (else its
  body's net volume) x the material's density, and `GrossWeight` the same on
  gross volume. The density comes, in order, from:
  1. the user's table (`parseDensities`: CSV `material,kg/m3` lines or
     `NAME=VALUE;NAME=VALUE`; names match case-blind);
  2. the model's own material properties (`modelDensities`: IFC4
     `IfcMaterialProperties` `Pset_MaterialCommon` `MassDensity`, IFC2x3
     `IfcGeneralMaterialProperties`), when between 10 and 12,000 kg/m3;
  3. the model's own stored weights (`learnedDensities`): a material whose
     elements that store a weight and the matching volume all give the same
     ratio within 0.5%, on two or more elements; the density is their median.
  A layered or mixed material (`A / B`) gets none unless the table names it
  as written.
- `geometry-quantities.mjs` `measureModel(text, { densities })` adds them
  (kind `weight`, written as `IfcQuantityWeight`). CLI `--fill ...
  --from-geometry --densities D.csv` (or the `NAME=VALUE` list); the page has
  a densities box under the geometry checkbox; the worker passes it through.
- Tests (`weights.test.mjs`): learning only on agreement (a disagreeing
  material, a single element, a layered name all refused); stored volume
  first, body's otherwise, net with net and gross with gross; the table over
  learned figures; IFC4 and IFC2x3 material densities with ARCHICAD's `0`
  ignored; the fill on the sample office's IPE 200 beam (its stored
  `NetVolume` 0.0142 m3 x 7,850 = 111.47 kg; the filled model passes this checker's IDS check).

## Setup

`ThatOpen/engine_web-ifc` `tests/ifcfiles/public/` (blob-less sparse clone,
not committed), all 28 `.ifc` files run. Three store weights, all Tekla:
ISSUE_021_Mini Project, ISSUE_102_M3D-CON, ISSUE_102_M3D-CON-CD.

```
node eval/member-weights.mjs DIR/*.ifc --json eval/member-weights-2026-11-22.json   # member-weights-2026-11-22.txt
node eval/member-weights-fill.mjs <the three>                                       # member-weights-fill-2026-11-22.txt
```

## Results

**One density per material explains every stored weight** (stored weight /
stored volume, all within 0.5% of the material's median):

| Model | Stored weights | Explained | Densities (kg/m3) |
| --- | --- | --- | --- |
| Mini Project | 1,027 | 1,027 | S235JR 8,000; concrete 2,450 (ISOLEX, BETON, SILEX, PREDAL, ISOBET, TT), 2,400 (GEWELF); PVC 1,300; timber 600 |
| M3D-CON-CD | 105 | 105 | S235JR 7,850; concrete 2,400 |
| M3D-CON | 20 | 20 | concrete 2,400 |
| **Total** | **1,152** | **1,152** | |

**Held out.** The weights of elements with an odd STEP id hidden, densities
learned from the even ones: 562 of 562 hidden weights predicted within 0.5%.

**A fixed textbook table** (steel 7,850, concrete 2,400, timber 500, what a
tool that assumes densities would use) on the same volumes: 152 of 1,145
within 0.5%. Mini Project's steel is 8,000 kg/m3 (1.9% above the textbook),
its concrete 2,450 and its timber 600. The same grade, S235JR, has two
densities in two offices' models: the density belongs to the model, not the
material name. That is why the fill never assumes one.

**The fill end to end.** Every `NetWeight`/`GrossWeight` renamed
`...AsExported`, the fill asked for `Qto_*BaseQuantities` `NetWeight` on
beams, columns, members, slabs, walls and plates
(`member-weights/member-weights.ids.xml`) with `--from-geometry` and the
densities typed as a table (those the unhidden model implies, as an office
types its catalogue once):

| Model | Written | Stored NetWeights rewritten | Within 0.5% | On elements that stored none |
| --- | --- | --- | --- | --- |
| Mini Project | 1,021 | 1,021 of 1,021 | 1,021 | 0 |
| M3D-CON | 20 | 20 of 20 | 20 | 0 |
| M3D-CON-CD | 112 | 105 of 105 | 105 | 7 |

The worst written value differs from Tekla's by under 0.001% (the fill
writes six significant figures). The 7 extra are elements of the same two
materials whose export carried no weight. The filled models still fail the
IDS on the elements with no material (nothing to weigh), so the run's
"passes every check" is false; every written element passes its own check.

## Other models

ARCHICAD (AC20-FZK-Haus, ISSUE_005_haus, C20-Institute) and two other files
write `Pset_MaterialCommon` `MassDensity`, almost all `0.` (no density set);
C20 has one material at 2,800 and ISSUE_171 six materials at 800-2,800. None
of these stores a weight to check against, so the material route is
measured by the unit test only.

## Not checked

- A Revit or ARCHICAD export that stores weights (none in this corpus):
  whether they weigh the stored volume or the body's.
- `GrossWeight`: only 6 stored (Mini Project); all 6 explained.
- Densities in non-SI units: `MassDensity` is read as kg/m3 and the
  plausibility window (10 to 12,000) drops a figure outside it, rather than
  converting a model's derived density unit.
- Rebar: ifc-quantity-takeoff weighs bars by nominal size; the fill does not
  offer rebar weights from density.
