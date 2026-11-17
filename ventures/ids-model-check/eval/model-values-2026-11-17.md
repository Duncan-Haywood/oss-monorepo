# IDS editor: a model's values for a property (2026-11-17)

**Question.** With a model open, the editor offered the classes, sets and
properties the model carries, but not the values. An author writing "fire
rating must be one of ..." or "tread length between ..." for a project still had
to read the values from another tool and type them. Can the editor offer the
values the model holds, and does a requirement built from them pass the model it
came from?

**What landed:**

- `inventory.mjs`: each property in the inventory now lists its values, read
  with the checker's own `PropertyFacet.values` (list members one by one,
  measures in SI units when given `measure-units.json`, as `worker.mjs` and the
  eval now do): the 50 commonest with how many objects carry each, how many
  different values there are (tracked up to 500), and the exact numeric min and
  max.
- `editor.mjs`: `modelSets` merges values across the specification's classes;
  `modelValueOffer` says what a row can use (values that fit its kind, values
  outside a standard's enumeration, whether the list is complete, the one-of
  list and the range); `outwardBound` rounds a range bound outward.
- A "one of" mode for any text property or attribute, not only standard
  enumerations: tick the model's values or add your own. Opened IDS files with an
  enumeration on a free-text facet now open as editable rows.
- The page: "In the model: N different values: ..." under the row, the counts
  beside a standard enumeration's values, the model's values offered in the
  "exactly" field, and one button, **Allow exactly these values** (text, when
  the full list is known) or **Use the model's range** (numbers).

## The range trap

The first run of `eval/model-values.mjs` built 1,014 requirements from the four
real exports' offers, with numbers shown to 12 significant digits, and **364 of
them failed the model they came from**. Every failure was a range:
`Pset_StairFlightCommon.TreadLength is 0.25399999999999995, not >= 0.254`.
Revit writes lengths converted from inches (10 in = 0.254 m) a few units in the
last place off, and IDS ranges take no rounding tolerance: buildingSMART's
`ImplementersDocumentation/tolerance.md` says so ("Tolerance does not apply to
ranges"). The checker was right and the offer was wrong.

An author who types the nominal value hits the same trap. With bounds shown to
12 significant digits (`--naive`), **364 of the 752 ranges (48%) fail their own
model**. `outwardBound` takes the shortest decimal at or beyond the exact value
and within IDS's equality tolerance of it (|v| x 1e-6 + 1e-6): 0.253999 for
0.25399999999999995, 0.107951 for 0.10795000000000012. The row says so when it
rounds: "as written, 0.25399999999999995 to ...; IDS ranges take no rounding
tolerance, so the model's range is 0.253999 to ...".

## Measured

`node eval/model-values.mjs DIR` on the four real exports from
`opensourceBIM/IFC-files` at `cb96c50` (the same files as
`model-inventory-2026-11-16.md`; not committed, fetched with a blob-less sparse
clone). A row is a (class, set, property) the editor offers as a row: a
standard set for that class, or a project's own set.

| Model | Schema | Property rows | With values | Full list known | One-of offered | Range offered | Built from offers: pass (as displayed) | (rounded outward) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| HHS Office/MEP.ifc | IFC2X3 | 562 | 562 | 535 | 85 | 449 | 286 of 534 | **534 of 534** |
| HHS Office/architect.ifc | IFC2X3 | 288 | 280 | 264 | 89 | 153 | 182 of 242 | **242 of 242** |
| HHS Office/construction.ifc | IFC2X3 | 261 | 248 | 248 | 64 | 126 | 145 of 190 | **190 of 190** |
| OpeningDesign.com/Schultz_Residence.ifc | IFC2X3 | 68 | 67 | 67 | 24 | 24 | 37 of 48 | **48 of 48** |
| **Total** | | **1,179** | **1,157** | **1,114** | **262** | **752** | **650 of 1,014** | **1,014 of 1,014** |

- 1,157 of 1,179 property rows (98%) have values to offer; for 1,114 the full
  list is known (no more than 50 different values).
- The 143 rows with values but no button are booleans (true/false already are
  modes), text with more than 50 values (an ID per object), or numbers in an
  own set with no data type.
- 21 standard properties written in a data type other than the template's are
  left out (the row already warns that a check with the template's dataType
  fails them).
- No standard property with an enumeration carries values in these exports, so
  the "outside the standard's list" warning is tested in `inventory.test.mjs`
  only, not yet on a real model.

Opened IDS files (`node eval/editor-open.mjs`, same corpora as
`several-classes-2026-11-17.md`), now that free-text enumerations are editable:

| Files | Write back the same | Editable facets, before | after | Files with every facet editable, before / after |
| --- | --- | ---: | ---: | --- |
| 64 public IDS | 64 / 64 (507 of 507 specs) | 1,631 (81.1%) | **1,650 (82.0%)** | 10 / 10 |
| 12 IDS-Audit-tool ValidFiles | 12 / 12 | 68 | **78** | 3 / 3 |
| 187 buildingSMART pass cases | 187 / 187 | 308 | **312** | 121 / **125** |

Against `ids.xsd` (`node eval/editor-open.mjs --write DIR`, then
`python3 eval/editor-xsd-compare.py DIR`, IfcTester 0.8.1): public files valid
53 before, 54 after writing back, 0 made invalid; 11 of 12 and 187 of 187
unchanged. Audit errors changed on no file.

Tests: `inventory.test.mjs` (values read as the checker reads them, in SI units;
"Allow exactly these values" and "Use the model's range" pass the model and a
changed value fails it; the 0.254 m trap; values outside a standard's list) and
the opened free-text enumeration. The page in Chromium (Playwright, 390 px) on
`samples/tiny-house.ifc`: FireRating shows "In the model: 1 different value:
60 min (1)", the button writes `<xs:enumeration value="60 min"/>`, a typed
value adds a ticked box, Qto Length offers "6 to 6 (SI units)" (the file is in
millimetres) and fills the range; no horizontal scroll, no console errors.
