---
title: "S235JR weighs 8,000 kg/m3 in one Tekla model and 7,850 in another"
seo_title: "Fill Qto_ NetWeight in an IFC model from volume and density"
date: 2026-11-22
tags: [ids-model-check, ventures, bim]
description: "The free IDS checker now writes missing Qto_ NetWeight values. The density comes from the model, not a textbook table, which would have got 152 of 1,145 right."
---

Steel is bought, lifted and shipped by the tonne, so an Information Delivery
Specification (IDS) for a steel or precast package nearly always asks every
beam, column and member for `Qto_BeamBaseQuantities.NetWeight`. If the model
doesn't carry one, the check fails, and someone has to type the weights in.

[IDS Model Check](https://marisstella.app/ids-model-check/) can already
measure missing volumes, areas, lengths and surface areas from each element's
geometry and write them into a copy of the model. Weight was left out
because no geometry defines it: you need volume times density, and IFC
carries a density only sometimes.

## How do exporters get their weights?

Three of the 28 public models we test against store weights, all from Tekla
Structures. For each element that stores both a weight and a volume, we
divided one by the other and grouped the results by material:

| Model | Material | kg/m3 | Stored weights that agree |
| --- | --- | --- | --- |
| Mini Project | STEEL/S235JR | 8,000 | 178 of 178 |
| Mini Project | CONCRETE/BETON (and five more) | 2,450 | 491 of 491 |
| Mini Project | CONCRETE/GEWELF | 2,400 | 27 of 27 |
| Mini Project | TIMBER/HOUT | 600 | 324 of 324 |
| M3D-CON-CD | STEEL/S235JR | 7,850 | 56 of 56 |
| M3D-CON-CD, M3D-CON | CONCRETE/Concrete_Undefined | 2,400 | 69 of 69 |

So every one of the 1,152 stored weights is the element's stored volume times
a single density for its material, to within 0.5%. The catch is that the same
steel grade weighs 8,000 kg/m3 in one office's model and 7,850 in another's.
Each office set up its own material catalogue.

A tool using textbook densities (steel 7,850, concrete 2,400, timber 500)
would have got 152 of the 1,145 weights right. The rest would be off by
1.9% (steel) to 20% (timber), which matters if those figures feed crane picks or a supplier's
quote.

## What the checker does now

The density comes from the model or from you, and is never assumed:

1. **Your table.** A `material,density` line for each material, named as the
   model names it (`STEEL/S235JR,7850`). On the page it goes in a box under
   "Measure missing Qto_"; on the command line it's `--densities rates.csv`.
2. **The model's own material properties.** `Pset_MaterialCommon`
   `MassDensity` (IFC4) or `IfcGeneralMaterialProperties` (IFC2x3). ARCHICAD
   writes `0` for every material that has no density set, so a 0 is ignored.
3. **The model's own stored weights.** If some elements of a material store a
   weight and all of them imply the same density, that density fills in the
   elements of that material that don't store one.

The volume used is the element's stored `NetVolume` when it has one, because
that's the figure the exporter weighed, and the volume measured from its
geometry when it doesn't.

## How we checked it

- **Held out:** hide the weights of half the elements, learn densities from
  the other half, then predict the hidden half. 562 of 562 came out within
  0.5%.
- **End to end:** rename every stored weight on the three models, ask the
  fill for `NetWeight` with the densities typed in as a table, and compare
  what it writes with what Tekla had stored. All 1,146 came back (1,021,
  20 and 105), every one within 0.001%.

What we couldn't check: no public Revit or ARCHICAD export in the corpus
stores a weight, so we don't know whether those tools weigh the stored volume
or the geometry. The method, the scripts and every number are in
[the evaluation](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/member-weights-2026-11-22.md).
The checker is free, MIT licensed, and runs in your browser, so the model
never leaves your machine.
