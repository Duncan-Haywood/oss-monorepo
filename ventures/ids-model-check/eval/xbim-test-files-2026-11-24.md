# The checker on xBIM's 128 test files: a property written as 1.#INF went missing (2026-11-24)

**Question.** The editor's model-driven sweeps (`model-inventory.mjs`,
`model-attr-ranges.mjs`, `model-attr-codes.mjs`, `model-values.mjs`) had run on
the opensourceBIM exports, buildingSMART's Sample-Test-Files and
engine_web-ifc's 28 public models (`mixed-type-own-props-2026-11-24.md`). Do
they hold on another public set, and does the STEP reader agree with
IfcOpenShell on the strings it decodes?

**Data.** The 128 `.ifc` and `.ifczip` files in `github.com/xBimTeam/XbimEssentials`
at commit `e3c8777` (2026-07-08): `Tests/TestFiles`, `Tests/TestSourceFiles`,
`Tests/FederationTestFiles`, `Tests/SubmittedFiles` and
`Xbim.Essentials.NetCore.Tests/TestFiles`. Fetched with a blob-less sparse clone
(`git clone --filter=blob:none --no-checkout --depth=1`, then
`git sparse-checkout set --no-cone '*.ifc' '*.ifczip'`), 19 MB. They are not
committed here. Unlike the other sets, many of them are deliberately bad:
files xBIM's own reader is tested against (FormallyIllegalFile, InvalidMultiByte,
Wrongly1251Encoded, Large_entity_label, InvalidHeaderFileName,
SpecicalSolidusEscape). The rest are small real exports (Revit, ARCHICAD,
BricsCAD, OpenRoads) and IFC4X3 geometry cases.

## The four sweeps

| Script | Result on the 128 files |
| --- | --- |
| `eval/model-inventory.mjs` | 128 of 128 read, 0 failed, 1,556 objects, in 1.0 s (IFC2X3, IFC2X3_FINAL, IFC4, IFC4X1, IFC4X3_RC4, IFC4X3_ADD1, IFC4X3_ADD2); 156 standard (class, set) pairs, 928 project-own; 23 of 457 standard properties in a type the template does not give (11 of them in HelloWallXml) |
| `eval/model-attr-ranges.mjs` | numbers 115 of 115, booleans 16 of 16 pass their model |
| `eval/model-attr-codes.mjs` | attribute one-of lists 1,295 of 1,295 pass, 1 of 1 fails on exactly the empty object the row warns about; codes 5 of 5 pass, 6 of 6 fail on exactly the warned objects |
| `eval/model-values.mjs` | property offers **3,786 of 3,786** pass; 5 own properties written in two types, handled by Accept any data type |

No new editor fault on this set.

## Strings, against IfcOpenShell 0.9.0

Every string value (attributes, list members, typed values such as
`IFCLABEL('...')`) of every file, read by `step.mjs` and by
`ifcopenshell.open` (pip `ifcopenshell` 0.9.0.post1), keyed by entity id and
argument path. The two scripts are short and not committed: walk each
entity's arguments, descend into lists and typed values, keep the strings.

- **91 of the 121 `.ifc` files compared, 24,290 of 24,290 string values
  equal**, including the `\X2\`, `\X4\`, `\X\`, `\S\` and `''` escapes
  in the Revit and ARCHICAD exports. (The 7 `.ifczip` files were not compared.)
- **30 files IfcOpenShell refuses** and this reader reads: 21 for a schema it
  does not ship (IFC4X1, IFC4X3_RC4, IFC4X3_ADD1, a bare IFC4X3,
  IFC2X3_FINAL), 5 for a header it cannot parse (no FILE_DESCRIPTION,
  ramp.ifc's byte-order mark, Wrongly1251Encoded's), and 4 for a syntax error
  (`EmptyMultibyteString`'s `\X2\\X0\`, `InvalidMultiByte`'s
  `\\X2\...\X0\`, `Large_entity_label`'s `#92147483647`,
  `FormallyIllegalFile`'s numbers, below). On these the reader is the
  more lenient of the two, by design: a checker that refuses a file tells its
  user nothing about the model.

How this reader reads the bad ones, by hand:

| File | What is in it | Read as |
| --- | --- | --- |
| EmptyMultibyteString | `'Test \X2\\X0\Test \X4\\X0\Test'` | `Test Test Test` (empty escapes), as ISO 10303-21 reads them |
| InvalidMultiByte | `'file://ATTRIBUTE1\\X2\30B3...\X0\.XLSX'` | a backslash, then the hex digits as text: `\\` is an escaped backslash, so no `\X2\` starts there. The property names before it (`\X2\30B330F3...\X0\`) decode to コンクリート体積 |
| Wrongly1251Encoded | `\X\E4\X\EE\X\EC` (Windows-1251 bytes for дом written as ISO 8859-1 escapes) | `äîì`, which is what the escapes say; the file's author meant дом. No reader can know that |
| FormallyIllegalFile #1 | a raw byte that is not UTF-8 in a string | U+FFFD in that place |
| Large_entity_label | `#92147483647` | read (a JS number holds it exactly) |
| **FormallyIllegalFile #2** | **`IFCCARTESIANPOINT((-1.#INF,-1.#IND,1.#INF))`** | **dropped, with a reader note**: the defect below |

## The defect: 1.#INF and -1.#IND

The Microsoft C runtime prints a double that is infinite or not a number as
`1.#INF`, `-1.#INF`, `-1.#IND`, `1.#QNAN` or `1.#SNAN`, sometimes with digits
after it (`1.#INF00`). An exporter that writes a computed value without checking it puts that
text in the file. xBIM keeps a test for it because users sent such files
(the file's header names The EXPRESS Data Manager 5.02 and a Revit exporter);
ISO 10303-21 has no such token.

The reader stopped at the `#`, recorded `#2: expected , or ) at 809` and left
the entity out. On a point that costs little. On a property it changes the
verdict: with `Acme.ThermalTransmittance` written as
`IFCTHERMALTRANSMITTANCEMEASURE(1.#INF)` on one wall, the property record was
dropped, so the wall had no such property and an optional "U at most 1" check
**passed** it. A required check would have reported "missing", sending the
author to look for a property that is there. An applicability facet on the
property left the wall out of the specification altogether.
(`samples/edge/msvc-inf-nan.ifc` and `.ids.xml`, before this change:
`PASS: 2 of 2 specifications pass`, the Thickness check applying to 1 wall.)

## What changed

- `step.mjs` `Reader.value()`: after a number ending in `.`, `#INF`, `#IND`,
  `#QNAN` or `#SNAN` (any case, digits after) is read as `Infinity`,
  `-Infinity` or `NaN`, and the record gets a reader note:
  `#90: 1.#INF read as Infinity (a Microsoft C runtime spelling, not ISO
  10303-21)`. The note appears where reader notes already do (CLI, page, HTML
  report, `parseErrors` in `--json`), once per record however often a lazy
  record is read. `1#INF` (no point) is still an error.
- `ids.mjs` failure text prints `Infinity` and `NaN` (JSON printed them as
  `null`): `Acme.ThermalTransmittance is Infinity, not <= 1`.
- `inventory.mjs` `lexical`: such values are listed as `INF`, `-INF` and
  `NaN` (XML Schema's spellings), kept out of the range and the exact number
  list. A number row holding one therefore offers no one-of, and the
  model's range is taken from its real numbers, so it fails these objects.
- `editor.mjs` `modelValueOffer` returns `nonFinite`, and `editor.html` says
  on the row: "INF (1) is not a number: the export wrote 1.#INF or -1.#IND, a
  fault in the tool that wrote it. Any range or value check fails that
  object; fix the source model or re-export."

After: `samples/edge/msvc-inf-nan.ifc` against its IDS, `FAIL: 0 of 2`, P-01
failing on `ThermalTransmittance is Infinity, not <= 1`, W-02 on
`Thickness is NaN, not >= 0`, two reader notes. `msvc-numbers.test.mjs` (8
tests) covers string and byte input, lazy and eager reads, the note, the
verdicts and the editor offer.

The four sweeps on the 128 files give the same numbers after the change, and
so does the string comparison (24,290 of 24,290). The venture suite passes
(543 tests).

## Not done

- Whether IfcTester reads such a file at all: IfcOpenShell 0.9.0 refuses
  `FormallyIllegalFile.ifc` with a syntax error, so there is no second
  verdict to compare with.
- A public real export with `1.#INF` in a property value. The xBIM file
  holds it on a point; the property case is the sample built here.
