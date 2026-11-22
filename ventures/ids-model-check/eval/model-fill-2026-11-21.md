# Writing what an IDS asks into the model (2026-11-21)

**Question.** A failing IDS check today sends the modeller back to the
authoring tool: map a parameter, export again, check again. For property
values the IDS itself already decides (a `simpleValue`, a one-item list), or
that a person can type into a table, can a browser tool write them straight
into a copy of the `.ifc`, without disturbing anything else in the file, so
that the same check (and IfcTester's) then passes?

`model-fill.mjs` (CLI `--fill`, page panel "Write the missing values into the
model") is the answer this note measures.

## Setup

- Models: the four real exports used since 2026-11-17 (`opensourceBIM/IFC-files`
  at `cb96c50`: HHS Office MEP 39.6 MB, architect 13.1 MB, construction 3.9 MB,
  all IFC2X3; OpeningDesign's Schultz Residence 22.5 MB, IFC2X3 from Revit;
  fetch steps in `model-attr-codes-2026-11-17.md`).
- IDS: the 65 public files `eval/fetch-audit-corpus.sh` fetches plus the 3
  starter files in `samples/` (68). One (`A3_IDS.ids`) is not well-formed XML
  and is read by neither tool. 272 model/IDS pairs.
- Each pair is filled twice (`eval/model-fill-sweep.mjs`):
  - **ids**: only the values the IDS fixes;
  - **table**: those, plus a stand-in for a person filling the to-fill table:
    the first value of an enumeration, a bound (or 1) for a number, `true` for
    a boolean, `X` for unrestricted text. Facets with a pattern are left
    unfilled. These values are made up to exercise the writer at scale; they
    say nothing about what a real project should hold.
- IfcOpenShell 0.9.0.post1 and IfcTester 0.9.0 from PyPI
  (`eval/model_fill_ifctester.py`) on the filled files the sweep saves (up to
  60 per mode per model, 8 for MEP).

```
sh eval/fetch-audit-corpus.sh            # IDS files into eval/corpus/real
# copy eval/corpus/real/*.ids and samples/*.ids.xml into IDS_DIR
node --max-old-space-size=8192 eval/model-fill-sweep.mjs MODEL.ifc IDS_DIR OUT/<model> --write 60
python3 eval/model_fill_ifctester.py OUT/<model> MODEL.ifc > OUT/<model>.ifctester.jsonl
python3 eval/model_fill_summary.py OUT
```

## Result

(Later the same day: the table stand-in returned `null` for numbers with no
restriction, so this note's table-mode counts undercount numeric writes; the
property results stand. See `model-fill-attributes-quantities-2026-11-21.md`.)

This checker, on its own output (the fill re-reads the file it wrote and tests
each written value with every facet on that element that names the property):

| Model | Mode | Pairs | Pairs with writes | Values written | Read back passing | Changed lines = edited + added records | Failing results before | after |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| MEP | ids | 68 | 4 | 9 | 9 | 4 of 4 | 5,664,125 | 5,664,125 |
| MEP | table | 68 | 20 | 331,261 | 331,261 | 20 of 20 | 5,664,125 | 5,558,014 |
| Schultz_Residence | ids | 68 | 6 | 59 | 59 | 6 of 6 | 3,425,839 | 3,425,839 |
| Schultz_Residence | table | 68 | 38 | 28,816 | 28,816 | 38 of 38 | 3,425,839 | 3,421,146 |
| architect | ids | 68 | 6 | 1,267 | 1,267 | 6 of 6 | 1,946,759 | 1,946,759 |
| architect | table | 68 | 34 | 161,137 | 161,137 | 34 of 34 | 1,946,759 | 1,889,519 |
| construction | ids | 68 | 4 | 9 | 9 | 4 of 4 | 582,865 | 582,865 |
| construction | table | 68 | 30 | 40,036 | 40,036 | 30 of 30 | 582,865 | 574,114 |

- **562,594 values written, 562,594 read back passing.** 1,344 of them are
  values the IDS fixes; the rest are the stand-in table values.
- **Nothing else in the file changed:** in all 142 filled files, the lines that
  differ from the original are exactly the records the fill reports editing
  (property sets and relationships) plus the records it added. Every other
  line is byte for byte the same.
- Property sets: 7,513 added, 2,427 edited in place, 52 copied because elements
  sharing a set were to get different values (the copy path, on real Revit and
  ArchiCAD data, not only the unit tests).
- "Failing results after" barely moves in **ids** mode: the elements that
  gained a value fail other requirements too (a material, a classification, a
  pattern no value was written for). The fill is a step, not a pass.

IfcOpenShell and IfcTester on the filled files:

| Model | Filled files | IfcTester refused the IDS | Opened by IfcOpenShell | Values checked | Failed before | Pass after | Existing elements newly failing | Fill's own records failing |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| MEP | 12 | 4 | 8 | 58 | 58 | 58 | 0 | 0 |
| Schultz_Residence | 44 | 9 | 35 | 4,755 | 4,755 | 4,755 | 0 | 16 |
| architect | 40 | 9 | 31 | 35,421 | 35,421 | 35,421 | 0 | 0 |
| construction | 34 | 9 | 25 | 5,140 | 5,140 | 5,140 | 0 | 0 |

- IfcOpenShell opened all 99 filled files whose IDS IfcTester accepts.
  (IfcTester refuses 8 of the IDS files outright: XSD-invalid, an older
  namespace, not well-formed. Those pairs were not cross-checked.)
- **45,374 of 45,374** written values IfcTester can check (a required
  property facet with one set name and one property name) failed before and
  pass after.
- **0** elements that were in the model before newly fail any requirement.
- 16 failing results are the fill's own new property sets and relationships,
  in three Schultz pairs. Those IDS files (`NL_BIM_Basis_ILS_v2`, `Basic IDM
  Check`) have specifications that apply to every rooted entity ("everything
  is classified", "everything has a material"), so they also check new
  property sets and relationships, and fail them just as they fail the
  thousands the model already had. The fill's summary now counts these apart
  (`after.addedRecords`).

## What the sweep found and fixed on the way

1. **A quadratic scan.** Finding the records to edit searched for the next
   `/*` comment from every record. On a file with no comments, each search
   ran to the end of the file. On the architect file, 2 values took 60 s;
   after the fix they take 1.2 s.
2. **A value that breaks another check.** On the architect export the first
   read-back flagged 2,212 of 7,073 values. The verifier there was too strict
   (it tested facets from specifications that do not apply to the element), but
   the case it pointed to was real: a value written to satisfy one
   specification could break another that applies to the same element. The fill
   now tests every applicable specification's facets on that property before it
   writes. Two specifications asking `EI30` and `EI60` of one wall write
   neither, and the table names the clash.
3. **A property set named like a quantity set.** `Basic IDM Check` asks for
   `BaseQuantities.NetFloorArea`. IFC2X3 exports name their
   `IfcElementQuantity` `BaseQuantities`, so the fill created an
   `IfcPropertySet` of the same name beside it. This checker merges same-named
   sets per property, as `ifcopenshell.util.element.get_psets` does for
   presence. IfcTester then reads data types and values from only the last set
   of that name (`ifctester/facet.py`, `pset_props["id"]`), so the
   quantities' `Height` newly failed on 4 spaces. The fill now refuses a set
   name the element already holds as anything other than a property set (66
   values on architect go to the table with the reason).
4. **Memory on 5.3 million failing results.** `NL_BIM_Basis_ILS` on the MEP
   export fails 5,321,789 times (specifications with no class). The fill kept a
   reason string for every failing result, twice, and ran out of an 8 GB heap.
   It now takes verdicts and counts from the checker (`maxFailed: 0`) and walks
   only the specifications it can write to. The pair fills 324,432 values in
   27.5 s, and the fixed-values-only run fell from 98.8 s to 13.0 s.

## Limits

- Property values only: quantities (`Qto_` sets, and any set name held as an
  `IfcElementQuantity`), attributes, classifications, materials and
  relationships are reported, not written. Of the 272 pairs, the to-fill table
  is the larger part of most runs: most failing requirements in public IDS
  files are not single fixed values.
- STEP only; the file is decoded as one string (to about 500 MB).
- The table-mode values are synthetic. No BIM manager's real filled table has
  been through it yet, and that is the next thing to try.
