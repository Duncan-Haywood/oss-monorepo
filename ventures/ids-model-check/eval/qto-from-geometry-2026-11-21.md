# Writing Qto_ quantities measured from the geometry (2026-11-21)

**Question.** The model fill (`model-fill.mjs`) writes a failing `Qto_`
quantity only when the IDS fixes it, a person types it, or the element holds
the same quantity in another quantity set (`eval/model-fill-attributes-quantities-2026-11-21.md`).
A Revit export with no quantity sets got nothing: every `Qto_` request went to
the to-fill table. `ifc-quantity-takeoff` already measures volumes and the
section areas the `Qto_` sets define from the same STEP geometry. Wired in,
how close are its values to what exporters store, and does the fill keep its
guarantees (every written value passes here and in IfcTester, nothing else
changes)?

## What changed

- `geometry-quantities.mjs` maps `ifc-quantity-takeoff`'s rows onto `Qto_`
  names: `GrossVolume`/`NetVolume` for any element with a body (net only when
  every opening was cut), wall `GrossSideArea`/`NetSideArea`,
  `GrossFootprintArea`/`NetFootprintArea` and `Width`, slab/plate/covering/roof
  `GrossArea`/`NetArea`, column/beam/member/pile `CrossSectionArea`. Lengths
  and heights are left out (a `Qto_` Length is a centre-line or nominal figure).
  A faceted body gives its volume but no cut area.
- `fillModel(..., { geometry })` asks it for a quantity after the IDS, the
  table and the element's own other quantity sets have given nothing, and only
  for the kind of quantity the facet asks (an area for `IFCAREAMEASURE`).
  The value, to six significant figures in the model's units, must still pass
  every facet that names it. The to-fill table's reason says when geometry
  was asked and gave nothing.
- CLI `--fill ... --from-geometry`; page checkbox *Measure missing Qto_
  volumes and areas*; the worker loads `../ifc-quantity-takeoff/` as the site
  serves it (checked in Chromium on a local build: 3 wall side areas written,
  3 failing to 0). Usage counter `fill_geometry_used`.

## Setup

The four real exports used since 2026-11-17 (`opensourceBIM/IFC-files` at
`cb96c50`: HHS Office MEP, architect and construction, IFC2X3;
OpeningDesign's Schultz Residence, IFC2X3 from Revit; fetch steps in
`model-attr-codes-2026-11-17.md`). The 65 public IDS from
`eval/fetch-audit-corpus.sh`, the 3 starter files and
`eval/qto-from-geometry/base-quantities.ids.xml`, a cost-estimating IDS written
for this check (wall net side area, net volume and width; slab net area and
volume; column and beam gross volume): 69 IDS, 276 pairs.

```
node eval/qto-from-geometry.mjs MODEL.ifc ... --json eval/qto-from-geometry-2026-11-21.json
node --max-old-space-size=7000 eval/model-fill-sweep.mjs MODEL.ifc IDS_DIR OUT/<model> --write 15 --modes geometry   # 6 for MEP
python3 eval/qto_from_geometry_summary.py OUT
python3 eval/model_fill_ifctester.py OUT/<model> MODEL.ifc     # IfcOpenShell 0.9.0.post1, IfcTester 0.9.0
```

## 1. Measured against what exporters stored

Where the HHS Office exports store a quantity the geometry also gives
(`eval/qto-from-geometry-2026-11-21.txt`; rows with nothing stored left out):

| Model | Class, quantity | Stored | Within 2% | Causes of the rest (ifc-quantity-takeoff's cause finder) |
| --- | --- | ---: | ---: | --- |
| construction | IfcColumn CrossSectionArea | 257 | 257 | |
| construction | IfcColumn GrossVolume | 257 | 257 | |
| construction | IfcWall GrossSideArea | 36 | 11 | split 17, repeated 2, area equals the stored volume 6 |
| construction | IfcWall GrossVolume | 36 | 11 | split 17, repeated 2, own dimensions 4, unexplained 2 |
| construction | IfcWall Width | 36 | 36 | |
| architect | IfcMember CrossSectionArea | 1,450 | 1,392 | half the surface stored 58 |
| architect | IfcMember GrossVolume | 1,450 | 1,450 | |
| architect | IfcWall GrossSideArea | 112 | 70 | net stored as gross 33, split 5, area equals the stored volume 4 |
| architect | IfcWall GrossVolume | 112 | 70 | net stored as gross 33, split 8, own dimensions 1 |
| architect | IfcWall Width | 112 | 112 | |

- **3,666 of 3,858 within 2%** (95.0%); the same count within 5%.
- **190 of the other 192 trace to the stored figure**, not the geometry:
  *split*/*repeated* is Revit's split-by-level export writing the whole wall's
  figure on every piece; *net stored as gross* is an exporter's GrossVolume or
  GrossSideArea with the openings already out; *half the surface* is Revit
  writing half a mullion's surface as its CrossSectionArea; *own dimensions*
  is a stored volume that disagrees with the element's own stored
  Length x Height x Width while the measured one agrees. 2 wall volumes are
  unexplained.
- MEP and Schultz store none of these quantities, so this table cannot speak
  for them; their walls and slabs are measured by the same code.
- What it does not show: net areas and volumes (no model here stores them for
  elements with openings), roofs and coverings, and IFC4 exports. The
  takeoff's own checks on eight models
  (`../ifc-quantity-takeoff/eval/areas-vs-stored-2026-11-20.md`) cover more
  classes.

## 2. The fill with geometry on

Per model (`python3 eval/qto_from_geometry_summary.py`; failing counts are
summed over all 69 IDS, so they are dominated by the large public files):

| Model | Pairs | Pairs with measured values | Values written | measured from geometry | copied from the model | Read back passing | Changed lines = edited + added | Failing before | after | errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| MEP | 69 | 0 | 14 | 0 | 0 | 14 | 4 of 4 | 5,664,125 | 5,664,125 | 1 |
| Schultz_Residence | 69 | 7 | 954 | 890 | 0 | 954 | 13 of 13 | 3,426,064 | 3,425,843 | 1 |
| architect | 69 | 7 | 3,675 | 1,103 | 1,300 | 3,675 | 16 of 16 | 1,946,946 | 1,946,726 | 1 |
| construction | 69 | 7 | 1,900 | 1,055 | 831 | 1,900 | 11 of 11 | 583,178 | 582,865 | 1 |

The one error per model is `A3_IDS.ids`, which is not well-formed XML (as in the earlier notes).


- **3,048 values measured from geometry and written** across 21 pairs:
  Schultz 890, architect 1,103, construction 1,055; MEP 0 (none of the 69 IDS
  asks the MEP model's classes for a `Qto_` area or volume).
- **Every written value read back passes** in this checker; the changed lines
  are exactly the records the fill says it edited and added, in every pair.
- **IfcTester** (the first 15 filled files per model were saved, all 21
  pairs with measured values among them): IfcOpenShell opens all 33 it reads,
  and every written value IfcTester can read (property, quantity and
  attribute facets naming one set and property), 6,470 of them, fails before
  and passes after; **0 elements** IfcTester passed before fail after. Two IDS files (`IDS_IBRO_FI_IMAGEM`,
  `section_0_2_1_shapes`) are refused by IfcTester's own XML validation, as
  before.
- `base-quantities.ids.xml`: Schultz 225 failing elements to 4 (437 values;
  the 4 are walls whose geometry gave no section area or net volume (a
  faceted body, or an opening that could not be cut), 10 values left for a
  person with that reason); architect 187 to 0;
  construction 313 to 0.
- The buildingSMART Portugal EIR files (6 of the 69) ask for `Qto_` areas and
  volumes on walls, slabs, columns and beams: geometry now writes 6 to 281
  values per pair, but those elements still fail other requirements in the
  same files (classification codes, Portuguese property sets), so their
  failing counts do not drop. A real project would fill those too, from the
  table.

## What is left

- Lengths and heights: a centre-line length needs the wall's axis
  representation, which `ifc-quantity-takeoff` does not read yet.
- `OuterSurfaceArea` and `NetSurfaceArea`: the takeoff computes a member's
  whole surface; which faces each `Qto_` set counts differs by class.
- The page measures the whole model before filling; a large model (Schultz:
  27 s in Node) could measure only the elements the IDS asks for.
