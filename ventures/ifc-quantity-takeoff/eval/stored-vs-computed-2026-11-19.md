# Stored quantities against the geometry, 13 public IFC models, 2026-11-19

**Question.** An IFC export carries two descriptions of each element's size:
its body geometry, and the quantity sets the authoring tool wrote
(`Qto_WallBaseQuantities.GrossVolume`, `BaseQuantities.NetVolume` and so on).
Estimators sum the stored figures. How often do they agree with the geometry,
and when they do not, why?

**Data** (not committed; fetched with blob-less sparse clones):

- `opensourceBIM/IFC-files` at `cb96c50`: HHS Office `architect.ifc` and
  `construction.ifc` (Revit, IFC2X3).
- `ThatOpen/engine_web-ifc` at `5ba2467`, `tests/ifcfiles/public/`: AC20-FZK-Haus
  and C20-Institute-Var-2 (ArchiCAD, IFC4), ISSUE_159_kleine_Wohnung_R22 (IFC4),
  ISSUE_021_Mini Project (Tekla, IFC2X3), schependomlaan, ISSUE_068_ARK_NUS_skolebygg,
  S_Office_Integrated Design Archi, dental_clinic, Office_A_20110811, duplex,
  ISSUE_034_HouseZ (IFC2X3, several tools). The last five store no volumes and
  test only that their geometry is read.

**Method.** `node eval/stored-vs-computed.mjs <files> --json eval/stored-vs-computed-2026-11-19.json`
(output in `stored-vs-computed-2026-11-19.txt`). For every element, `geom.mjs`
computes the body volume (gross) and the body less its `IfcRelVoidsElement`
openings (net) in the model's length unit, cubed to m3. A stored GrossVolume is
compared with the computed gross and a NetVolume with the computed net; a pair
agrees within 2%. Each disagreement is given the first cause that explains it
(`explainChecks` in `qto.mjs`, the same code the page runs):

| Cause | Test |
|---|---|
| split | the same stored value on several elements with one Tag and class, whose computed volumes sum to it |
| repeated | the same, the stored value at least 1.5 times the largest piece, but the pieces here do not sum to it |
| unit-slip | stored = computed x 10^k (k from -9 to 9, not 0) within 2% |
| net-as-gross | stored GrossVolume = computed net, on an element with openings |
| own-dimensions | stored volume differs from the element's own stored Length x Height x Width, and the computed volume agrees with that product |
| unexplained | none of these |

## Result

| Model | Elements | Volume computed | GrossVolume: agree / pairs | NetVolume: agree / pairs |
|---|---:|---:|---:|---:|
| HHS construction (Revit) | 339 | 339 | 268 / 293 | - |
| HHS architect (Revit) | 2,527 | 2,527 | 1,462 / 1,562 | - |
| AC20-FZK-Haus (ArchiCAD) | 82 | 82 | **18 / 18** | **18 / 18** |
| C20-Institute-Var-2 (ArchiCAD) | 701 | 697 | **149 / 149** | **149 / 149** |
| kleine_Wohnung_R22 | 425 | 263 | 209 / 260 | **226 / 226** |
| Mini Project (Tekla) | 2,636 | 2,636 | 615 / 637 | 2,516 / 2,636 |
| schependomlaan | 3,573 | 3,551 | 1,240 / 1,345 | 3,184 / 3,274 |
| ARK_NUS_skolebygg | 4,459 | 4,459 | 844 / 1,231 | 40 / 63 |
| **8 models with volumes** | | | **4,805 / 5,495 (87.4%)** | **6,133 / 6,366 (96.3%)** |

Where they agree, they agree to the last digit: on HHS architect the median
relative difference of the agreeing pairs is 8e-16 and the 90th percentile
2e-15. The two computations are the same arithmetic on the same numbers.

The 690 GrossVolume disagreements:

| Cause | Count | Where |
|---|---:|---|
| net-as-gross | 325 | skolebygg 260, HHS architect 33, kleine_Wohnung 32: the exporter's "GrossVolume" has the openings taken out |
| unit-slip | 99 | 96 skolebygg slabs, stored 1,000 times the geometry (354,722.9 for a 354.72 m3 slab): litres written under a m3 unit; 3 kleine_Wohnung roof slabs whose GrossVolume (and GrossArea) is the geometry divided by 10.7639, the m2-to-ft2 factor (rerun 2026-11-19 after the area check found the factor; 10.7639 and its inverse were added to the unit-slip test, and its tolerance tightened to 0.5%) |
| split / repeated | 27 | HHS walls exported per level: every piece stores the whole wall (three pieces of one wall store 11.60 m3 each; their bodies sum to 11.61) |
| own-dimensions | 21 | the stored volume contradicts the element's own stored Length x Height x Width (HHS construction #656: 16.94 m3 stored, 8.30 x 3.30 x 0.20 = 5.48, body 5.55) |
| unexplained | 218 | below |

So 472 of the 690 have a cause the tool can name, and in 147 of those (split,
repeated, unit-slip, own-dimensions) the stored figure is the wrong one: the
bill of quantities uses the computed volume for those rows instead.

**Unexplained (218 gross, 233 net), by class:**

- schependomlaan: 91 walls and 14 slabs (gross), 69 windows, 18 doors (net), all
  faceted breps. Walls 15-28% under the stored figure; not diagnosed.
- HHS architect: 58 curtain-wall mullions (`IfcMember`, shell-based surface
  models read as closed shells), computed 42% over the stored. The mullion type
  name says "mit Deckprofil" (with cover cap): the stored figure may leave the
  cap out. Not confirmed.
- Mini Project (Tekla): 96 beams and 46 accessories 2-3% off. Checked one: a
  60 x 1 mm tube 400 mm long is pi (30^2 - 29^2) x 400 = 74,141 mm3, which is
  what this tool computes (7.414e-5 m3); Tekla stores 7.225e-5, its own faceted
  approximation. On these the stored figure is the less exact one.
- skolebygg: 22 slabs, 18 + 5 members, 1 wall; kleine_Wohnung: 8 walls
  whose openings are advanced breps (net not computable here); its 3 slabs
  are now unit slips (the square-foot factor, above).

**Not read.** 162 elements of kleine_Wohnung are `IfcAdvancedBrep` (NURBS) and
511 of S_Office are open shells or boolean differences against faceted solids;
both are reported as "not read", never guessed. Net volume could not be
computed for 49 elements whose openings are advanced breps or faceted.

## Two readings the corpus forced

1. **Revit's `IfcBoxedHalfSpace` is bounded by its box.** The IFC text calls the
   enclosure a computational aid, but HHS architect wall #89890 (3,115 mm
   profile, stored 3,000 mm long and 0.48 m3) comes out right only if the cut
   removes the half space's material *inside the box* (the box read in the base
   plane's coordinates): as a plain half space the plane at x = 1,500 removes half
   the wall (0.24 m3). Reading it bounded moved 5 more HHS walls into agreement.
2. **A boolean's second operand is resolved by id.** The first run of this
   script crashed on 309 bodies whose second operand was itself an extrusion;
   fixed before these numbers.

## What this does not show

Eight models with stored volumes is a small sample, three of them from one
tool family. Areas are checked separately in
[areas-vs-stored-2026-11-19.md](areas-vs-stored-2026-11-19.md). Overlapping openings in one element would be subtracted twice; whether any
model here has them was not checked.
