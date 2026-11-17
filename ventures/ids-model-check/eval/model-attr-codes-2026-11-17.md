# IDS editor: a model's attribute values and classification codes (2026-11-17)

**Question.** The editor offered the values a model holds for a property
(`model-values-2026-11-17.md`), but attribute rows (Name, ObjectType, Tag,
PredefinedType) and classification rows still had to be typed from another
tool. Can they be offered the same way, and does a requirement built from the
offer pass the model it came from?

**What landed:**

- `inventory.mjs`: each class lists `attrs` (every attribute the editor offers,
  not GlobalId, read as `AttributeFacet` reads it: the value as written,
  enumerations by name, no unit conversion) and `codes` (per classification
  system, each reference's own code, as `ClassificationFacet` compares them,
  a type's references inherited). Both count `empty`: objects with the
  attribute set to `''` or UNKNOWN, or classified in the system with no code.
- `editor.mjs`: `modelAttributes` and `modelCodes` merge them across a
  specification's classes (shared `mergeTally` with `modelSets`);
  `modelValueOffer` now also returns `empty`.
- The page: attribute and classification rows show "In the model: ..." and
  **Allow exactly these values**, as property rows do; classification rows
  name the systems the model's objects use when the typed one is not among
  them; when some objects carry the system with no code, the row says so and
  offers **Require a code** (pattern `.+`).

## The empty-code trap

The Schultz Residence (written by Revit's IFC exporter 3.2.0.0, per its
`FILE_NAME` header) classifies its elements in Uniformat only, but 93 of its
134 `IFCCLASSIFICATIONREFERENCE`s have an empty `ItemReference`
(`IFCCLASSIFICATIONREFERENCE('http://www.csiorg.net/uniformat','','',#739)`).

| Schultz Residence | Classified in Uniformat | With no code |
| --- | ---: | ---: |
| Elements (occurrences) | 210 | **143** |
| Type objects | 134 | 93 |

An IDS that asks "must be classified in Uniformat" passes all 210, so a BIM
coordinator who writes it believes the model is classified. 143 elements (68%)
would fail any check that asks for a code. The checker already gave the right
verdict either way; what was missing was telling the author before they write
the requirement. **Require a code** writes
`<classification><value><xs:restriction base="xs:string"><xs:pattern value=".+"/></xs:restriction></value><system>...</system></classification>`,
which fails exactly the uncoded objects (tested in `inventory.test.mjs`).

## Measured

`node eval/model-attr-codes.mjs DIR` on the same four exports from
`opensourceBIM/IFC-files` at `cb96c50` as `model-values-2026-11-17.md` (not
committed; blob-less sparse clone). Each offer is written as an IDS
requirement (attributes "if present, must match", classifications "must
have", exact class) and checked against its own model with the checker. A row
with no empty objects should pass; one with empty objects should fail on
exactly those (plus, for a required classification, the class's objects
outside the system).

| Model | Schema | Attribute rows | One-of offered | Pass (no empty objects) | Fail on exactly the empty ones | Class x system rows | One-of offered | Pass (all coded) | Fail on exactly the uncoded |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| HHS/MEP.ifc | IFC2X3 | 52 | 35 | 35 of 35 | 0 of 0 | 0 | 0 | 0 of 0 | 0 of 0 |
| HHS/architect.ifc | IFC2X3 | 62 | 46 | 46 of 46 | 0 of 0 | 0 | 0 | 0 of 0 | 0 of 0 |
| HHS/construction.ifc | IFC2X3 | 46 | 42 | 42 of 42 | 0 of 0 | 0 | 0 | 0 of 0 | 0 of 0 |
| OD/Schultz_Residence.ifc | IFC2X3 | 138 | 120 | 119 of 119 | 1 of 1 | 12 | 10 | 2 of 2 | 8 of 8 |

```
attr: 298 rows, 289 with values, 243 full list known, one-of offered 243; 2 rows with 136 objects carrying no value; built from offers: 242 of 242 pass (no empty objects), 1 of 1 fail on exactly the objects the row warns about
code: 12 rows, 10 with values, 10 full list known, one-of offered 10; 8 rows with 234 objects carrying no value; built from offers: 2 of 2 pass (no empty objects), 8 of 8 fail on exactly the objects the row warns about
Examples:
  IFCFLOWFITTING.ObjectType: 45 Degree, Standard
  IFCFLOWSEGMENT.ObjectType: Flex Duct Round:Flex - Round, Pipe Types:Standard, Rectangular Duct:Mitered Elbows / Taps, Rectangular Duct:Mitered Elbows / Tees, ...
  IFCDUCTSEGMENTTYPE.PredefinedType: FLEXIBLESEGMENT, NOTDEFINED
  IFCFLOWTERMINAL.ObjectType: 100W - 277V, 1200mm - 277V, 15 mm Pendent on Drop with Guard, 2400mm - 277V, ...
  IFCBUILDINGELEMENTPROXY.ObjectType: 100 A, 11 kW, 125 A, 1383-2808 LPS, ...
  IFCDUCTFITTINGTYPE.ElementType: 45 Degree, Standard
  IFCAIRTERMINALTYPE.ElementType: 450 x 200, 600 x 600 Face 300 x 300 Connection, 600x600 - 200 Neck, 600x600 - 250 Neck, ...
  IFCAIRTERMINALTYPE.Tag: 379463, 383543, 386293, 386707, ...
  IFCLIGHTFIXTURETYPE.ElementType: 100W - 277V, 1200mm - 277V, 2400mm - 277V, 600x600 - 277, ...
  IFCLIGHTFIXTURETYPE.Tag: 431650, 431863, 433693, 435210, ...
```

- 243 of 298 attribute rows offer a one-of list; the 46 others with values
  hold more than 50 different ones (mostly Name and Tag, one per object). Of
  the 243, 242 have no empty objects and all pass. The two rows with empties
  are Schultz's 146 building element proxies, 68 of them written with Name
  and ObjectType `''` (`IFCBUILDINGELEMENTPROXY('35FNj0fJf39wFuW_p2maja',#41,'',$,'',...)`);
  ObjectType's one-of fails on exactly those 68, and Name (78 different
  values) offers no list. The row says "68 of them hold an empty value or
  UNKNOWN, which any check of Name fails, even if present".
- The three HHS Office exports carry no classification. Schultz's 12
  class-by-system rows: 2 fully coded pass, 8 fail on exactly the uncoded and
  unclassified objects, 2 (a duct fitting and its type) have no code at all
  and offer nothing.
- Property offers after the shared merge: `node eval/model-values.mjs` still
  1,014 of 1,014.

Not yet: numeric attributes (OverallHeight, Elevation) are offered as a one-of
list of their values but not as a range; a range needs the attribute facet
written with an `xs:double` base, the next step. Numeric attribute values are
compared as the model writes them (no unit conversion, as the checker does).

Tests: `inventory.test.mjs` (attribute values and leaf codes on
`samples/tiny-house`, GlobalId left out; attribute and enumerated-attribute
offers pass and a dropped value fails; an uncoded reference counted, passing a
system-only requirement and failing one-of and Require a code). The page in
Chromium (Playwright, 390 px) on the tiny house with one wall given an uncoded
Uniclass reference: the Name row offers P-01, W-01, W-02 and ticks all three;
the classification row says "1 of them has a Uniclass 2015 reference with no
code" and Require a code writes `.+`; no horizontal scroll, no console errors.
