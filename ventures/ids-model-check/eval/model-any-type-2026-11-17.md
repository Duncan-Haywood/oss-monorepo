# IDS editor: standard properties a model writes in another data type (2026-11-17)

**Question.** On four real exports, 21 of 122 standard-set properties are
written in a data type the IFC2X3 template does not give
(`model-inventory-2026-11-16.md`): Revit writes `Pset_*Common.Reference` as
IFCLABEL where the template says IFCIDENTIFIER, `NumberOfRiser` as IFCINTEGER
not IFCCOUNTMEASURE, `Pset_RailingCommon.Height` as IFCREAL. The editor wrote
the template's dataType on those rows and said "a check with this dataType
will fail them", with nothing to do about it. Writing the model's dataType
instead is a template error in the audit (and in buildingSMART's
IDS-Audit-tool). What does a check with no dataType do, and do the two
checkers agree on it?

**What landed:**

- `editor.mjs` `untypeRow(L, row, modelType)`: a standard-set row whose model
  writes another type becomes an untyped row (no dataType, the text modes).
  A text value carries over; `true`/`false` becomes that literal; a range, or
  any value on a real-number model type, becomes "any value" (`dropped`).
  `typeRow` turns it back into the template's row (21 of 21 here).
- The page: such a row's note now adds that a check with no dataType passes
  those objects and the audit accepts it, with an **Accept any data type**
  button. An untyped standard row on a real-number model type checks
  presence only, and if it already asks for a value it warns that checkers
  read it apart.
- `eval/model-any-type.mjs OUT DIR...`: writes three IDS files per model and
  checks them.

## Measured

`node eval/model-any-type.mjs OUT four/` on the four exports from
`opensourceBIM/IFC-files` at `cb96c50` (HHS Office MEP, architect and
construction; OpeningDesign's Schultz Residence; fetched as in
`model-attr-codes-2026-11-17.md`, not committed). One specification per
(class, standard set, property) the model writes in another type, exact class,
property required:

| Model | Properties in another type | Template dataType (before) | No dataType (**Accept any data type**) | No dataType, the model's values (one of) |
| --- | ---: | --- | --- | --- |
| MEP.ifc | 0 | - | - | - |
| Schultz_Residence.ifc | 0 | - | - | - |
| architect.ifc | 8 (431 objects) | 0 of 8 pass, 557 of 557 objects fail; audit clean | 5 of 8 pass, 159 of 557 fail; audit clean | 5 of 8 pass, 159 of 557 fail; 8 warnings |
| construction.ifc | 13 (393 objects) | 0 of 13 pass, 409 of 409 fail; audit clean | 9 of 13 pass, 16 of 409 fail; audit clean | 7 of 11 pass, 16 of 387 fail; 11 warnings |

- **791 of 966 applicable objects failed only for their data type.** With no
  dataType, every remaining failure is a real gap: the object has no such set
  (84 proxies; 16 failures on 4 stairs and 4 slabs in construction), no such property (42 coverings
  without `Finish`) or an empty value (33 spaces' `Reference`).
- Model type for the template's: IFCLABEL for IFCIDENTIFIER 14, IFCINTEGER
  for IFCCOUNTMEASURE 4, IFCLABEL for IFCTEXT 1, IFCREAL for
  IFCPOSITIVELENGTHMEASURE 1, IFCPOSITIVELENGTHMEASURE for IFCLENGTHMEASURE 1.
- Presence with no dataType audits with no error and no warning; a value with
  no dataType draws the existing `value-no-datatype` warning (IDS 1.0 expects
  a dataType with a value).

## Against IfcTester

`python3 eval/crosscheck_ifctester.py OUT/<model>.<variant>.ids <model>.ifc`
with IfcTester 0.8.0 on ifcopenshell 0.8.5 (`pip install ifcopenshell==0.8.5`,
`pip install --no-deps ifctester==0.8.0`; the full `ifctester` install fails
building odfpy here):

| Variant | architect | construction |
| --- | --- | --- |
| template dataType | 8 of 8 same | 13 of 13 same |
| no dataType | 8 of 8 same | 13 of 13 same |
| no dataType, model's values | 8 of 8 same | 11 of 11 same |

The first run of the values variant also asked for a value on the one
real-number property, `Pset_StairFlightCommon.NosingLength`, written
`IFCPOSITIVELENGTHMEASURE(29.99999999999999)` in millimetres. The editor
offered `0.03` (the checker's SI reading). This checker passed 8 of 8 stair
flights, IfcTester failed 8 of 8: with no dataType, IfcTester does not convert
the unit. That is why `untypeRow` keeps only presence on a real-number model
type, the page no longer offers values there, and the table above leaves that
property out of the values variant (19 specifications, not 21). Integers
(`NumberOfRiser = 17`) and labels agree.

## Checked in the page

`editor.test.mjs` ("untypeRow: ..."): not offered for the template's own type,
for own sets or with no model type; the row writes no dataType, audits clean
as presence and warns with a value; typeRow restores it; a range and a
real-number value drop to presence, an integer value stays. In headless
Chromium (Playwright, 390 px): the construction model open, then
`construction.template.ids` opened: 13 rows show **Accept any data type**;
one click takes the XML from 13 `dataType=` attributes to 12 and the row
offers **Write dataType IFCIDENTIFIER** back; no page errors, no horizontal
scroll.

Not done: the same offer on an own-set row whose model type the page does not
offer, and a real BIM coordinator's IDS on a model that writes these types.
