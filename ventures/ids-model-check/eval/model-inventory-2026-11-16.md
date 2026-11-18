# IDS editor: writing for a model you have (2026-11-16)

The editor offered the standard Pset_/Qto_ sets a class *can* carry. An author
writing requirements for a project usually has a model in hand, and the
question is what *that* model carries. **Open a model to write for**
(`editor.html`) reads an IFC model (.ifc, .ifcxml, .ifczip) in the page's worker
with the checker's own reader and lists, per class, how many objects there are,
the sets on them and each property's data type as the model writes it
(`modelInventory` in `inventory.mjs`; set and property inheritance from types is
the same `psetsOf` the checker uses, so the names offered are the names a check
finds). The editor then offers those first:

- the model's classes at the top of the class list, each with an
  **Add a specification** button in the model card;
- on a property requirement, the standard sets the model's objects of that class
  carry ("on 112 of 112 in the model") before the other standard sets, then
  **the model's own sets** (any name outside buildingSMART's `Pset_`/`Qto_`
  prefixes);
- for an own set, the model's properties in a datalist; picking one fills in
  the data type the model writes it in;
- a note when the model writes a standard property in a type other than the
  template's (a check asking the template's dataType fails those objects), and
  when the model has no object the specification applies to.

## Own property sets are now editable rows

Before today a property facet on a set outside the standard (`Acme_Wall`) was
"kept as written" when an IDS was opened, and could not be written at all. It is
now an editable row: set name, property, and a dataType from the schema's
comparable defined types (IFCLABEL first). The prefixes are reserved
case-sensitively, as in the audit (`pset-custom`) and the IDS-Audit-tool, so
Revit's `PSet_Revit_Dimensions` is a project's own set and audits clean, and a
misspelt `Pset_WallCommonn` stays kept as written for the audit to flag. A value
asked of an own set with no dataType also stays kept as written (the page asks
for a dataType before it offers values).

`node eval/editor-open.mjs` (same files as `editor-open-2026-11-16.md`):

| Files | Write back asking the same | Facets editable before | After |
| --- | ---: | ---: | ---: |
| 64 public IDS files | 64 of 64 (507 of 507 specs), 0 audit changes | 1,509 (75.0%) | 1,598 (79.4%) |
| IDS-Audit-tool ValidFiles | 12 of 12 (288 of 288) | 12 (1.5%) | 68 (8.4%) |
| buildingSMART `pass-*` cases | 187 of 187 | 256 (68.4%) | 308 (82.4%) |

## What real models carry: `node eval/model-inventory.mjs DIR...`

Models (not committed; fetched with a blob-less sparse clone): buildingSMART
`Sample-Test-Files` at `80d976a` (every .ifc under 30 MB: 35 models, the Simple
Scene set in three schemas and five ISO reference-view files) and four exports
from `opensourceBIM/IFC-files` at `cb96c50` (HHS Office architect, construction
and MEP, ArchiCAD/Revit-era IFC2X3; OpeningDesign's Schultz Residence, Revit).
A "(class, set) pair" is one set carried by objects of one class.

| Models | Objects | Standard pairs | Pset_/Qto_ not standard for the class | A project's own | Standard props in another data type |
| --- | ---: | ---: | ---: | ---: | ---: |
| 35 buildingSMART samples | 1,819 | 23 | 8 | 6 | 0 of 85 |
| 4 real exports | 10,766 | 44 | 4 | 347 (1,057 props) | 21 of 122 |

| Real export | Schema | Objects | Classes | Standard | Not standard | Own | Other data type | Seconds |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| HHS Office MEP.ifc (39.6 MB) | IFC2X3 | 5,562 | 15 | 1 | 0 | 66 | 0 of 1 | 2.52 |
| HHS Office architect.ifc (13.1 MB) | IFC2X3 | 3,298 | 17 | 8 | 2 | 145 | 8 of 18 | 0.79 |
| HHS Office construction.ifc (3.9 MB) | IFC2X3 | 576 | 13 | 8 | 1 | 74 | 13 of 35 | 0.21 |
| Schultz_Residence.ifc (22.5 MB) | IFC2X3 | 1,330 | 38 | 27 | 1 | 62 | 0 of 68 | 1.21 |

What this says:

- **On the real exports, 347 of 395 (class, set) pairs (88%) are a project's own
  sets**, mostly Revit's (`PSet_Revit_Constraints` on 22 classes,
  `PSet_Revit_Dimensions` 21, `PSet_Revit_Phasing` 21, `PSet_Revit_Type_Identity
  Data` 20). Before today the editor could offer none of them. The clean
  buildingSMART samples carry almost none (6 of 37), which is why the earlier
  editor looked complete when tested on them.
- **21 of 122 standard-set properties in the real exports are written in a
  data type the template does not give**: `Reference` as IFCLABEL where the
  IFC2X3 template says IFCIDENTIFIER (in five sets), `Finish` as IFCLABEL not
  IFCTEXT, `Pset_StairCommon.NumberOfRiser` as IFCINTEGER not IFCCOUNTMEASURE,
  `Pset_RailingCommon.Height` as IFCREAL. An IDS that asks for the template's
  dataType fails every one of those objects; the editor now says so on the row.
- 4 pairs are a standard set on a class the template does not name
  (`Pset_SlabCommon` and `Pset_WallCommon` on other classes).
- Reading time in Node: 0.2 to 2.5 s per model; the 13 MB architect model is read
  and listed in the page in 0.9 s (Playwright, headless Chromium).

## Checked in the page

`inventory.test.mjs` (7 tests): the inventory of `samples/tiny-house` (class
counts, predefined types, sets, properties and data types, classification
systems); STEP, ifcXML and .ifczip copies give the same inventory; `modelSets`
merges a class with its subclasses; a row for the model's own set writes an IDS
that audits clean and passes on that model (and fails the one wall that is not
external when a value is asked); an opened IDS's own-set facets become rows and
write back the same; `PSet_Revit_*` audits clean. Driven in headless Chromium:
open a model, add a specification from the model card, pick an own set, pick a
property (data type filled in), ask for a value; no page errors, no horizontal
scroll at 390 px.

Not done: several classes per specification and property/attribute facets in
the applicability stay kept as written; the editor does not yet suggest *values*
the model uses (enumerations of the labels in a property).
