# IDS editor: specifications written for several IFC versions (2026-11-17)

**Question.** An IDS specification can name several schemas,
`ifcVersion="IFC2X3 IFC4"`: the Dutch NL-BIM Basis ILS and RVB BIM Norm files
(OpenAEC Foundation's validator and viewer), BASIX (`IFC2X3 IFC4 IFC4X3_ADD2`),
buildingSMART's community samples and 147 of the 187 buildingSMART pass test
cases do. The CLI audit (`node cli.mjs --audit`) reads such a specification in
every schema it names and calls it invalid only when every one finds the
fault. The editor opened the file in **one** schema, the first version most
specifications name (IFC2X3 for all of the files above), and its live audit
used only that one. So:

- standard sets IFC2X3's templates lack (`Qto_SpaceBaseQuantities`,
  `Pset_LandRegistration` and `Pset_Address` on IfcSite, `Pset_Condition` on
  IfcFlowSegment) opened as read-only XML, and
- the page's audit called them errors ("not a standard IFC2X3 property set")
  that the CLI, reading the same file, does not raise.

Kept-facet tally that pointed here: `node eval/kept-facets.mjs` listed 132
property requirements in class specifications of public files held as written;
16 of them were these.

## What landed

- `editor.mjs`:
  - `idsSchemaChoices(parsed)`: the schemas every specification names (a
    specification naming none fits any).
  - `importIds` opens a file with more than one such schema in each, and
    keeps the one with the most editable facets; a tie keeps the old pick
    (`idsSchema`), then IFC4, IFC4X3, IFC2X3. It returns `schemaRows` (rows
    per schema tried) for the page's message. Each specification keeps its own
    `ifcVersion`, so the file writes back with the same versions.
  - `auditSchemaIds(doc)`: the page's schema plus every schema a
    specification's `ifcVersion` names, in the CLI's order (IFC2X3, IFC4,
    IFC4X3; the order decides which schema's reason an error names when all
    have one).
  - `schemaIdsOf`, and `importIdsAs` (import in a given schema; the eval
    compares the two picks).
- `editor.html`: loads every schema a draft names and audits each
  specification in all of them; the open message says "each written for
  IFC2X3 and IFC4; the page edits in IFC4, where the most facets are editable
  (IFC2X3 25, IFC4 26)"; a specification's note says which schemas it is
  audited against and that it is valid when any has what it asks.

A file whose specifications share no schema (one says IFC2X3, another IFC4)
opens as before, in `idsSchema`'s pick; its audit now also uses every schema
named, as the CLI's does.

## Measured

`node eval/multi-version.mjs` (corpora from `eval/fetch-audit-corpus.sh` and
`eval/fetch-testcases.sh`). "Before" is the old pick and a one-schema audit of
the written-back file; "CLI" is `auditIds` on the original with all three
schemas. Full output: `eval/multi-version.txt`.

| Files | With a multi-version specification | Opened in another schema | Facets editable | Page audit errors the CLI does not raise |
| --- | ---: | ---: | --- | --- |
| 65 public IDS | 18 | 5 | 332 -> **350** (kept 95 -> 77) | **18 -> 0** |
| 12 IDS-Audit-tool ValidFiles | 3 | 0 | 5 -> 5 | 0 -> 0 |
| 187 buildingSMART pass cases | 147 | 0 | 254 -> 254 | 0 -> 0 |

The five files that moved:

| File | Before | After | False page errors |
| --- | --- | --- | --- |
| Moult/ifcbasix BASIX (`IFC2X3 IFC4 IFC4X3_ADD2`) | IFC2X3, 19 of 29 editable | IFC4X3, **29 of 29** | 8 -> 0 |
| OpenAEC BIM-validator NL_BIM_Basis_ILS_v2 | IFC2X3, 25 of 27 | IFC4, 26 of 27 | 2 -> 0 |
| OpenAEC BIM-validator RVB_BIM_Norm_v1.1 | IFC2X3, 58 of 65 | IFC4, 61 of 65 | 3 -> 0 |
| OpenAEC open-3d-viewer NL_BIM_Basis_ILS_v2 | IFC2X3, 25 of 27 | IFC4, 26 of 27 | 2 -> 0 |
| OpenAEC open-3d-viewer RVB_BIM_Norm_v1.1 | IFC2X3, 58 of 65 | IFC4, 61 of 65 | 3 -> 0 |

The page's audit and the CLI's now give the same errors and warnings on all 18
public files except one error on four of them: the CLI's
`prohibited-requirements` on a prohibited specification with requirements,
which the editor drops on opening and says so (IDS 1.0 cannot evaluate them;
`eval/editor-open-2026-11-16.md`).

Whole corpora, `node eval/editor-open.mjs`: 64 of 64 public files, 12 of 12
IDS-Audit-tool valid files and 187 of 187 pass cases still write back asking
the same, spec by spec; audit errors changed on 0. Public facets editable
1,795 -> **1,813** (89.2% -> **90.1%**), files with every facet editable 19 ->
**20** of 64. Kept property requirements in class specifications of public
files (`node eval/kept-facets.mjs`): 132 -> **116**.

## The page

`node eval/multi-version-page.mjs [FILE.ids] [SCREENSHOT.png]` (Playwright,
Chromium, 390 px). Its own two-specification file (`IFC2X3 IFC4`, IfcSpace
NetFloorArea in Qto_SpaceBaseQuantities and Pset_SpaceCommon.Reference): opens
in IFC4, 4 of 4 facets editable (3 in IFC2X3), audit VALID, CLI 0 errors. The
NL_BIM_Basis_ILS_v2 file: IFC4, 26 of 27 editable, page 1 error, CLI 2 (the
dropped prohibited requirement). No horizontal scroll, no page errors.

Tests: `editor.test.mjs`, "an IDS whose specifications all name IFC2X3 and
IFC4 opens in the schema that edits most, and is audited in both". Full suite
`node --test *.test.mjs`: 180 tests, 179 pass, 1 skipped, 0 fail.

## Why the other 116 are kept

A tally of the 132, taken before this change (the 16 above are the "Pset_ or
Qto_ set not standard for the class in the page's schema" rows of the
multi-version files):

- 29 use IDS 0.9's `<name>` instead of `<baseName>` (CHEK, RulebookProcessing,
  community samples): not IDS 1.0, kept as written.
- 18 name the set or property by a pattern (`.*BaseQuantities.*`,
  `Pset_.*Common`).
- About 30 give a standard property a dataType its template does not
  (`Pset_ManufacturerOccurrence.SerialNumber` as IFCTEXT, template
  IFCIDENTIFIER; Spain's `Qto_SpaceBaseQuantities` as IFCREAL), or a property
  the template lacks (Portugal's `Lenght`): the audit's `pset-datatype` and
  `pset-property` faults. A row that keeps the file's dataType with a
  **Use the template's type** fix is the next item.
- 14 write an empty restriction (`<value><xs:restriction base="xs:double"/></value>`)
  on an own set; the page writes no value there.
- The rest are non-standard `Pset_` names (`Pset_4D_ConstructionSequencing`,
  `Pset_IBRO`), which IDS reserves for standard sets.
