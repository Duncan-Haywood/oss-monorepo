# Writing quantities and attributes into the model (2026-11-21)

**Question.** The model fill (`model-fill.mjs`, `eval/model-fill-2026-11-21.md`)
wrote property values only. It counted failing `Qto_` quantity and attribute
requirements and left them for the modeller. Can it write those too, with the
same guarantees: nothing else in the file changes, every written value passes
in this checker and in IfcTester, and no element that passed before fails
after?

## What changed

- **Quantities.** A failing property facet whose set is `Qto_*`, or a name the
  element already holds as an `IfcElementQuantity`, is written as a quantity.
  The class (`IfcQuantityLength`, `Area`, `Volume`, `Count`, `Weight`, `Time`)
  comes from the facet's data type, or from the standard `Qto_` template when
  the facet gives none. Quantity sets are edited in place, copied or added
  exactly as property sets are. A data type that no quantity holds
  (`IFCPOSITIVELENGTHMEASURE`; an `IfcQuantityLength` holds `IfcLengthMeasure`)
  is refused, with that reason.
- **Values copied from the model.** When the element already holds a
  quantity of the same name and class in another quantity set, and every such
  set agrees on its value, that value is written. IFC2X3 exports keep
  quantities in a set named `BaseQuantities`, and IDS files written for IFC4
  ask for the same quantities under `Qto_*BaseQuantities`. The number is copied
  digit for digit when the source carries no unit of its own (else it is
  converted through SI). It is never computed.
- **Attributes.** A failing attribute facet is written into the element's own
  record when that attribute is unset (`$` or `''`). Strings, numbers (as
  given: attributes are compared in project units by this checker and by
  IfcTester), booleans and enumerations (checked against the type's own
  values) are written. A value that is already set is never overwritten. What
  no table value could fix (a GlobalId, a derived, list or object attribute,
  or an attribute named by a pattern) is counted in the summary and not listed
  in the to-fill table. A pattern-named attribute on every entity made 203,748
  rows on the 3.9 MB construction model.
- **Fixed in the sweep.** The stand-in for a person filling the table
  (`eval/model-fill-sweep.mjs`) returned `null` for any number with no
  restriction, because `null ?? null` is not `undefined`. Such values were
  refused as "not a number", so the 2026-11-21 table-mode numbers count fewer
  numeric writes than the stand-in meant to make. The fill now treats `null`
  as no value given.

## Setup

Same as `eval/model-fill-2026-11-21.md`: the four real exports (HHS Office
MEP, architect and construction from `opensourceBIM/IFC-files` at `cb96c50`,
all IFC2X3; OpeningDesign's Schultz Residence, IFC2X3 from Revit). The 65
public IDS files from `eval/fetch-audit-corpus.sh` plus the 3 starter files,
272 model/IDS pairs, each filled in **ids** mode (only values the IDS fixes,
plus quantities copied from the model) and **table** mode (also the stand-in
values, which are made up to exercise the writer at scale). IfcOpenShell
0.9.0.post1 and IfcTester 0.9.0 check the saved files
(`eval/model_fill_ifctester.py`, which now also checks attribute facets and
reports by kind).

```
sh eval/fetch-audit-corpus.sh
node --max-old-space-size=7000 eval/model-fill-sweep.mjs MODEL.ifc IDS_DIR OUT/<model> --write 60   # 8 for MEP
python3 eval/model_fill_ifctester.py OUT/<model> MODEL.ifc > OUT/<model>.ifctester.jsonl
python3 eval/model_fill_summary.py OUT
```

## Result

This checker, on its own output:

| Model | Mode | Pairs with writes | Values written | properties | quantities (copied from the model) | attributes | Read back passing | Changed lines = edited + added records | Failing before | after |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| MEP | ids | 4 | 14 | 9 | 0 (0) | 5 | 14 | 4 of 4 | 5,664,125 | 5,664,125 |
| MEP | table | 26 | 350,518 | 344,150 | 6,355 (0) | 13 | 350,518 | 26 of 26 | 5,664,125 | 5,557,998 |
| Schultz_Residence | ids | 6 | 64 | 59 | 0 (0) | 5 | 64 | 6 of 6 | 3,425,839 | 3,425,839 |
| Schultz_Residence | table | 45 | 32,041 | 31,042 | 968 (0) | 31 | 32,041 | 45 of 45 | 3,425,839 | 3,420,893 |
| architect | ids | 15 | 2,460 | 1,267 | 1,188 (1,188) | 5 | 2,460 | 15 of 15 | 1,946,759 | 1,946,726 |
| architect | table | 40 | 165,124 | 162,410 | 2,503 (1,188) | 211 | 165,124 | 40 of 40 | 1,946,759 | 1,888,961 |
| construction | ids | 7 | 552 | 9 | 538 (538) | 5 | 552 | 7 of 7 | 582,865 | 582,865 |
| construction | table | 33 | 42,781 | 41,258 | 1,510 (538) | 13 | 42,781 | 33 of 33 | 582,865 | 574,042 |

- **ids mode: 3,090 values written, was 1,344.** 1,726 are quantities copied from
  the two HHS Office models' own `BaseQuantities`, and 20 are attributes the
  IDS fixes. Pairs with writes: 32, was 20.
- Quantities copied, by name (from the saved ids-mode files): door Height and
  Width 399 each, slab Width 225 + 24, column OuterSurfaceArea 514, space
  GrossFloorArea 99, space Height 66. The Revit models (Schultz, MEP) have
  nothing copied: their exports carry no `BaseQuantities` with these names.
- **Copies are exact:** all 3,452 copied values in the saved files match, as
  text, a quantity value in the original file. An earlier version of the copy
  rounded to 12 digits (3440025.053859637 written as 3440025.05386); fixed and
  re-run before these numbers.
- **590,464 of 590,464** values read back passing in table mode. In every
  filled file the changed lines are exactly the records the fill edited
  (property and quantity sets, relationships, and now the element records
  that gained an attribute) plus the ones it added.
- Sets in table mode: 7,777 added, 3,660 edited, 74 copied.

IfcOpenShell and IfcTester on the filled files:

| Model | Filled files | IfcTester refused the IDS | Opened | Values checked | Failed before | Pass after | Existing elements newly failing | Fill's own records failing |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| MEP | 12 | 4 | 8 | 83 | 83 | 83 | 0 | 0 |
| Schultz_Residence | 51 | 9 | 42 | 8,022 | 8,022 | 8,022 | 0 | 24 |
| architect | 55 | 9 | 46 | 40,605 | 40,605 | 40,605 | 0 | 8 |
| construction | 40 | 9 | 31 | 8,970 | 8,970 | 8,970 | 0 | 0 |

By kind, IfcTester's checked and passing counts: properties 50,111 of 50,111;
quantities 7,271 of 7,271; attributes 298 of 298.

- **0** elements that were in the model before newly fail any requirement.
- The 32 failing results are the fill's own new sets and relationships, under a
  specification that applies to every entity (for example "Description
  required"). They fail it as the model's own sets do. This is the same effect
  the first note describes.
- One IDS (`A3_IDS.ids`) is not well-formed XML; neither tool reads it.

## What is left

- **Quantities from geometry.** Where no set holds the quantity (all of
  the Revit models' `Qto_` requests), a person types it in, or it stays
  unwritten. `ifc-quantity-takeoff` computes areas and volumes from the same
  STEP geometry. Wiring it in would fill these from the model itself, with
  that venture's measured error stated next to each value.
- An ifcXML writer; a BIM manager's own filled table.
