# IDS Model Check

Check an IFC building model against a buildingSMART **Information Delivery
Specification (IDS 1.0)** file, in the browser or on the command line, and get
every failing element with the reason, plus a BCF issue list your BIM tool can
open. MIT licensed, no dependencies, nothing uploaded.

**Live tool:** https://marisstella.app/ids-model-check/

- **334 of 334** of buildingSMART's own IDS test pairs scored right (suite commit
  `870f9c4`, 2026-09-25; see "How it was checked").
- **Same answers as IfcTester** on five real models and two IDS files, element by
  element, except where IfcTester 0.9.0.post1 disagrees with the XSD standard
  and buildingSMART's suite (multiple `xs:pattern`s; below); and on
  buildingSMART's twelve IFC 4.3 and HVAC Simple-Scene models (bridge, road,
  rail, earthworks, plumbing, ducts) with three IDS files, 348 of 348
  specification results identical (`eval/infra-mep-crosscheck-2026-11-17.md`).
- STEP `.ifc`, ifcXML (`.ifcxml`, both the IFC2X3 and IFC4 layouts) and `.ifczip`
  (either one zipped), read into the same entities: xBIM's ifcXML export of a
  Revit model agrees with its STEP file on 2,205 of 2,205 attribute values.
- IFC2X3, IFC4 and IFC4X3 (ADD2); all six facets (entity, attribute, property,
  classification, material, part of); value restrictions (enumeration, pattern,
  bounds, length); IDS float tolerance; unit conversion to SI from the project's
  units; IFC2X3 occurrence classes through buildingSMART's type mapping table.
- **IDS audit:** before any model is read, each specification is checked
  against the IFC schema it names, and an invalid one is reported as INVALID
  with the reason instead of failing every element. 26 of buildingSMART's 27
  `invalid-*` IDS files are flagged, none of the 307 valid ones, and all 12
  example IDS files in buildingSMART's repository audit clean. Works with no
  model: `node cli.mjs --audit spec.ids`, or "Audit the IDS only" on the page.
  An entity facet naming an abstract class (IFC2X3's `IFCBUILDINGELEMENT`)
  draws a warning: IDS matches exact classes, so it selects nothing, and the
  warning lists the concrete classes to name instead. Found in 2 of 64 public
  IDS files (both copies of the Dutch RVB BIM Norm), none of buildingSMART's
  test files (`eval/abstract-classes-2026-11-17.md`).
- **Property set templates:** a `Pset_`/`Qto_` set or property the standard does
  not have (`Pset_WallComon`, `AkousticRating`, with the near name when there
  is one), a `dataType` the template does not give, and a set the selected
  classes cannot carry, checked against buildingSMART's templates for IFC2X3,
  IFC4 and IFC4X3 ADD2. Catches all 5 such files in buildingSMART's
  IDS-Audit-tool test set; on 64 IDS files from public repositories it found
  template faults in 21, among them `Lenght` in three quantity sets of buildingSMART
  Portugal's national requirements.
- **IDS editor** (`editor.html`, 2026-11-16): pick a class, then a standard
  set that class can carry, then a property; the editor writes the template's
  `dataType`, offers the standard's enumeration values, lists subclasses (IDS
  matches exact classes) and audits the IDS live. Every choice it offers was
  written out and audited: 203,433 specifications across the three schemas,
  none with an error or a warning; a 15,102-specification sample validates
  against buildingSMART's `ids.xsd` in IfcTester. Hands the file straight to the
  checker. `eval/editor-2026-11-16.md`.
  **Opens an existing IDS** (2026-11-16): what the page can edit becomes
  editable rows, the rest is kept as written (shown as XML, written back
  unchanged, removable). 64 of 64 public IDS files, 12 of 12 IDS-Audit-tool
  valid files and 187 of 187 buildingSMART pass cases write back asking the
  same thing, spec by spec and facet by facet; none becomes invalid against
  `ids.xsd`; 75% of the public files' facets open as editable rows.
  `eval/editor-open-2026-11-16.md`.
  **Writes for the model you have** (2026-11-16): open an IFC model in the
  editor and it lists each class with its object count and the sets on them,
  offers the sets the model's objects of a class carry first ("on 112 of 112"),
  and lets you write a project's own set (Revit's `PSet_Revit_Dimensions`,
  `Acme_Wall`) as an editable row with the data type the model uses. On four
  real exports, 347 of 395 (class, set) pairs were own sets the editor could not
  offer before, and 21 of 122 standard properties were written in a data type
  the template does not give (the row says so). Own sets also open as editable
  rows: 79.4% of the public IDS files' facets (was 75.0%), all still writing
  back the same. `eval/model-inventory-2026-11-16.md`.
  **Several classes per specification** (2026-11-17): "Also applies to"
  takes more classes (`IFCSLAB, IFCBEAM`), written as one entity facet; the
  page then offers only the standard sets, attributes and predefined types
  every class shares. Opened files' class lists open as editable: 29
  specifications in 11 public files, 81.1% of the public files' facets editable
  (was 79.4%), every file still writing back the same and none made invalid
  against `ids.xsd`. `eval/several-classes-2026-11-17.md`.
  **A model's values** (2026-11-17): with a model open, each property row
  says what values the model holds ("In the model: 3 different values: REI 60
  (12), ...") and offers them: **Allow exactly these values** writes a one-of
  list, **Use the model's range** a range. Ranges are rounded outward because
  IDS ranges take no tolerance and Revit writes 0.254 m as
  0.25399999999999995: on four real exports, 364 of 752 ranges taken from the
  values as displayed fail their own model; all 1,014 requirements built from
  the offers pass. "One of" now works on any text property or attribute (82.0%
  of the public files' facets editable, was 81.1%).
  `eval/model-values-2026-11-17.md`.
  **Attribute values and classification codes** (2026-11-17): attribute rows
  (Name, ObjectType, Tag, PredefinedType...) and classification rows offer
  the values and codes the model holds the same way. On four real exports, 243
  attribute rows offer a one-of list and all 242 with no empty value pass their
  model. Schultz Residence (a Revit export) has 93 Uniformat references with an
  empty code: 143 of its 210 Uniformat-classified elements (and 93 of 134 type
  objects) carry the system but
  no code, so an IDS that names only the system passes them. The row says so
  and offers **Require a code** (a `.+` pattern), which fails exactly those.
  `eval/model-attr-codes-2026-11-17.md`.
  **Conditions beyond the class** (2026-11-17): **Narrow it** adds a row to
  the applicability, so a specification can be about external walls only
  (Pset_WallCommon.IsExternal = true), solid walls, or elements classified in
  Uniclass: a property, attribute, classification, material or place, with the
  model's values offered as on requirement rows. With a model open, each
  condition says how many of the class's objects it keeps; that count is the
  checker's own `applicable` figure on 11 tested conditions, and the page
  says nothing rather than guess where the inventory cannot tell. Opened files'
  applicability facets now open as rows where they write back unchanged: 83.5%
  of the public files' facets editable (was 82.0%), 14 of 64 files fully
  editable (was 10), IDS-Audit-tool valid files 21.5% (was 9.7%), all still
  writing back the same. `eval/applicability-rows-2026-11-17.md`.
  **Values with no dataType** (2026-11-17): a property value an opened file
  wrote with no dataType opens as a row that keeps none (text modes, written
  on xs:string), with **Write dataType ...** to add the template's type.
  84.9% of the public files' facets editable (was 83.6%), 507 of 507
  specifications still writing back the same. It matters: three published
  IDS files ask `Pset_WallCommon.LoadBearing` = `TRUE` or `True` with no dataType, and on
  the sample house that kind of condition keeps 0 walls in this checker and 2
  in IfcTester 0.8.0; typed as IFCBOOLEAN `true`, both keep 2. The row and the
  audit's warning now say so. `eval/untyped-values-2026-11-17.md`.
  **Accept any data type** (2026-11-17): where the open model writes a
  standard property in another type (Revit's `Reference` as IFCLABEL, not
  IFC2X3's IFCIDENTIFIER), the row offers to drop the dataType, which checks
  the property whatever type it holds and still audits clean (the model's
  type would be a template error). On two real exports, 791 of 966 objects
  failed such checks only for their type; with no dataType, only the 175
  that lack the set, property or value fail, and IfcTester 0.8.0 agrees on
  21 of 21. A real-number value with no dataType is read apart (this checker
  converts mm to m, IfcTester does not), so those rows keep presence only.
  `eval/model-any-type-2026-11-17.md`.
  **A range for numeric attributes** (2026-11-17): OverallHeight, Elevation,
  NumberOfRiser and other real or integer attributes get a **between** mode
  and **Use the model's range**, written with an `xs:double` (or
  `xs:integer`) base as IDS's own test cases write it; boolean attributes
  (Sizeable) are asked true/false. On four real exports and the sample house,
  27 of 27 numeric and 6 of 6 boolean requirements built from the model pass
  it, and IfcTester gives the same verdict on all 33. Attributes are compared
  in the model's own units (millimetres or feet in these exports), not SI, in
  this checker and in IfcTester; the row says so.
  `eval/model-attr-ranges-2026-11-17.md`.
  **The model's range on dates, times and durations** (2026-11-17): with a
  model open, an IFCDATE, IFCDATETIME, IFCTIME or IFCDURATION row says
  which dates the model's values run between and offers **Use the model's
  range** beside "Allow exactly these values". The earliest and latest come
  from every value (not the 50 listed), merged across classes; a property
  holding any value of another form ("TBC" in a date) gets no range, since
  none would pass it. On 600 generated doors the range passes the model in
  the page, fails a door one day late, and "Write as a pattern" keeps both
  verdicts. No public real export at hand holds a date to try it on.
  `eval/model-date-range-2026-11-17.md`.
  **Exclusive bounds** (2026-11-17): each bound of a **between** row is
  "at least" or "more than", "at most" or "less than", written as
  `xs:minExclusive` / `xs:maxExclusive`, counted in a condition's model
  matches and opened back as a row. 5 of the 6 exclusive-bound facets in
  the public files (U-values "more than 0.5 and less than 2.1", a block
  height "more than 0", a friction angle "less than 0.610866" radians) open
  as rows (85.2% of facets editable, was 84.9%), 28 more in the IDS-Audit-tool
  valid files (25.0%, was 21.5%), all still writing back the same. Eight
  inclusive/exclusive ranges on the sample house's 2100 mm door: 8 of 8 the
  same verdict in IfcTester 0.9.0. `eval/exclusive-bounds-2026-11-17.md`.
  **Date, time and duration ranges** (2026-11-17): IFCDATE, IFCDATETIME,
  IFCTIME and IFCDURATION properties and attributes get a **between** row
  written on `xs:date`, `xs:dateTime`, `xs:time` or `xs:duration`, as IDS
  1.0's DataTypes table gives them. IfcTester 0.9.0 casts range bounds to
  float, so it fails every object on such a range (0 of 10 date ranges the
  same as this checker on 61 doors); the row warns, and **Write as a
  pattern** rewrites a date range as the XSD pattern of the same dates
  (`datePattern`), which both checkers read the same way: 10 of 10, same
  failing doors. Presence-only standard properties with no dataType now open
  as rows: 86.4% of public facets editable (was 85.2%), 17 of 64 files fully
  editable (was 14). `eval/date-ranges-2026-11-17.md`.
  **One of on dates and durations** (2026-11-17): a one-of row on those types
  writes its list on the same base (`xs:date`, ...), not `xs:string`; an opened
  list on either base opens as a row, and one on `xs:string` (what the editor
  wrote before) keeps it, so earlier files write back byte for byte, with a
  **Write on xs:date** button. Both checkers compare the listed values as text
  whatever the base: 8 rows on 61 doors give the same failing doors on both
  bases, 16 of 16 the same in IfcTester 0.9.0, and the row says that P24M does
  not match P2Y. 13 of the 29 date lists in the IDS-Audit-tool valid files now
  open as rows (28.1% editable, was 26.5%). `eval/date-oneof-2026-11-17.md`.
  **Specifications with no class** (2026-11-17): IDS lets a specification
  select objects by an attribute or property alone ("anything with a Version",
  "anything where Pset_WallCommon.IsExternal is true"). Such a specification now
  offers every standard set and every attribute some class has (468 in IFC4),
  typed only when every class that has the attribute types it the same
  (OverallHeight is a length everywhere, so it gets a range; Name is
  IFCSIUNITNAME on IFCSIUNIT, so it stays text), and opened ones edit as rows:
  IDS-Audit-tool valid files 75.9% of facets editable (was 28.1%), public
  files 89.2% (was 86.4%), every file still written back asking the same.
  `eval/no-class-specs-2026-11-17.md`.
  **One of on numbers** (2026-11-17): number properties and attributes get a
  one-of row ("door height 2100 or 2400", "12 or 14 risers") on `xs:double` or
  `xs:integer`; each value must be a number IDS reads (`2,4` and `3.0` on an
  integer are refused). With a model open, a row holding at most 12 values
  offers **Allow exactly these values**, listing each value exactly as the
  model holds it: IfcOpenShell's IfcTester 0.9.0 compares listed numbers
  with no tolerance, so a list at 12 digits failed 20 of 25 Schultz Residence
  windows there. On 4 real exports and the sample house, 663 offered lists
  pass their model; IfcTester agrees on 646 (all 27 attribute lists; the 17
  apart are feet, square feet or degrees it converts with its own table), and
  on only 22 of 324 lists typed to 6 digits, which the row warns about. 109
  of the 129 numeric lists in the IDS-Audit-tool valid files now open as rows
  (89.2% editable, was 75.9%). `eval/number-oneof-2026-11-17.md`.
  **Specifications written for several IFC versions** (2026-11-17): a file
  whose specifications all say `IFC2X3 IFC4` (the Dutch NL-BIM Basis ILS and
  RVB BIM Norm, BASIX) opens in the schema where most facets are editable,
  not the first named, and the page audits each specification in every
  schema it names, as the CLI does. On the 18 public files with such
  specifications, errors the page raised and the CLI did not went from 18 to
  0; BASIX opens fully editable in IFC4X3 (29 of 29, was 19); 90.1% of public
  facets editable (was 89.2%). `eval/multi-version-2026-11-17.md`.
  **A standard property in the file's own dataType** (2026-11-17): an opened
  Pset_/Qto_ property written in a type the page would not write for it
  (DfE's SerialNumber as IFCTEXT, template IFCIDENTIFIER; Spain's
  GrossFloorArea as IFCREAL) opens as a row that keeps that type and writes the
  file back unchanged. When the templates refuse it, the row says a model that
  follows the standard can never pass and offers **Use the template's type**,
  which carries the value over when it fits. 16 rows in 7 public files: all 16
  refused, all values carried over, the files' 14 `pset-datatype` errors go to
  0 in the page and the CLI, still valid against ids.xsd; 90.8% of public facets
  editable (was 90.0%). `eval/template-type-2026-11-17.md`.
  **Did you mean Length?** (2026-11-17): a property one slip from its
  template's name (Portugal's `Lenght`, Rotterdam's `AkousticRating`) shows the
  audit's "did you mean" with **Use Length**; the audit now counts a swapped
  pair of letters as one slip. 17 rows in 7 public files, all open as editable
  rows after the fix; name errors 31 to 14 (the rest are no slip: `Mark`,
  `Verblijfsruimte`), and the page agrees with the CLI on every file.
  `eval/name-suggestion-2026-11-17.md`.
- Exports: BCF 2.1 (one topic per failing element, selected by IfcGuid), CSV,
  JSON.
- 22 MB Revit export (Schultz Residence, 424,819 entities): 1.4 s on the command
  line.
- **Duplicate GlobalIds** (2026-11-17): IFC requires every GlobalId to be
  unique (IfcRoot rule UR1), and BCF viewpoints and model diffs find elements
  by it. Two elements sharing one are reported as a model finding in every
  output: on the page, in the text report, CSV, BCF (a topic each), and in CI
  (an annotation on the element's line, the job summary, a GitLab issue per
  GlobalId; `--fail-on-duplicate-globalids` to fail on them). It does not
  change the IDS verdict. On 163 public files it found 3, the same groups as
  IfcOpenShell on all 133 files IfcOpenShell opens. One of them is HHS Office
  `construction2.ifc`, where a column has a slab's GlobalId. It also found a
  STEP reader fault, now fixed: `\S\'` (an escaped "§") ended a string early.
  `eval/duplicate-globalids-2026-11-17.md`.
- **GlobalIds shared between models** (2026-11-17): when CI checks a
  federated set (one export per discipline), it also compares the models.
  A GlobalId held in two files is reported (text, annotation on the element's
  line, job summary, GitLab issue `ifc-shared-globalid`, JSON, Action output
  `shared-globalids`; `--fail-on-shared-globalids` to fail on them), and two
  files that are one model twice (a revision left beside the current file, or
  `.ifc` and `.ifczip` of the same model) are one finding. A project, site,
  building, storey, space or grid shared on purpose is counted, not warned
  about. On the HHS Office architect, MEP and structural exports it finds one
  wall ("Basic Wall:STB 30.0:573321") in both the architect's and the
  structural file; on buildingSMART's Simple-Scene, the house roof in
  architecture and structure and two manholes in plumbing and electrical.
  `eval/federated-globalids-2026-11-17.md`.
- **Shared on purpose: an allow list, and the types that follow an element**
  (2026-11-17): a type, property set or relationship that only follows a
  shared element (its IfcRelDefinesByType, its material link) is listed under
  that element ("with it: ...") instead of being a finding of its own, and a
  relationship whose one GlobalId links different objects in different files
  is called out as such (a viewer merging by GlobalId keeps one and drops the
  other's links). `--shared-globalids-allow FILE` (Action input
  `shared-globalids-allow`) takes a team's list, one rule per line: a GlobalId,
  a class (`IFCGRID`), a class and a name (`IFCBUILDINGELEMENTPROXY "origin"`,
  `*` matching any run) or `* "name"`. A shared element every holder of which
  matches is not counted, nor is what follows it; rules that matched nothing
  are listed so a stale list does not hide a new mistake. On buildingSMART's
  IFC4 Simple-Scene the findings go from 35 to 23 with no list (8 elements
  carry 14 followers; 12 relationships reuse one GlobalId for different
  links) and to 21 with two rules for its survey markers, which clear 8
  GlobalIds. HHS Office is unchanged (1 wall). `eval/federation-allow-2026-11-17.md`.

## Why someone would use it

A BIM manager or client writes one IDS ("every wall has `Pset_WallCommon.IsExternal`,
every door is on a storey, every element has a Uniclass code") and wants every
consultant's model checked against it before it is shared. Today the options are:

| Option | Cost | What you need |
| --- | --- | --- |
| Solibri Office, other commercial model checkers | seat licence (thousands a year) | Windows desktop install; does much more (clash detection, geometry rules) |
| BIMcollab Zoom, usBIM.IDS-checker, other vendor tools | free tier or subscription | install or an account, and often an upload of the model |
| IfcTester (IfcOpenShell) | free, LGPL | Python and a command line, or Bonsai/BlenderBIM |
| **IDS Model Check** | free, MIT | a browser tab; or Node for CI |

What this does better: nothing to install, nothing uploaded (the model is read
by JavaScript in the tab), a BCF export so failures go straight back into Revit,
Archicad, Navisworks or BIMcollab as issues, and a dependency-free engine that
drops into a CI job (`node cli.mjs model.ifc spec.ids` exits 1 on a fail).

## Run it

Browser: open `index.html` (the checker) or `editor.html` (the IDS editor) through any static server (`npx serve .` or
`python3 -m http.server`), drop a model and an IDS. The page loads only its own
`schema/*.json` tables.

Command line (Node 20+):

```
node cli.mjs model.ifc spec.ids                 # text report, exit 1 on a fail
node cli.mjs model.ifcxml spec.ids              # ifcXML, or an .ifczip, the same way
node cli.mjs model.ifc spec.ids --json          # full report
node cli.mjs model.ifc spec.ids --bcf out.bcfzip --max-failures 20
node cli.mjs --audit spec.ids                   # is the IDS itself valid? exit 1 if not
node cli.mjs model.ifc spec.ids --no-audit      # run invalid specifications as written
```

Library: `import { check } from "./node.mjs"; check(idsText, ifcText)` in Node,
or `checkIds(idsText, ifcText, { schemas, typeMap, measureUnits })` from
`ids.mjs` anywhere.

Two starter IDS files written for this tool are in `samples/`:
`coordination-basics.ids.xml` (served as `.ids.xml` so the site sends an XML content type; rename to `.ids` if your tool wants it: external/load-bearing walls, wall materials, named
doors and windows on a storey, named spaces, no proxies) and
`quantities-and-naming.ids.xml` (door heights in metres, wall length quantities,
naming patterns, storeys in a building, classification, slab types, fire-rating
format). `samples/tiny-house.ifc` is a hand-written IFC4 model with deliberate
gaps for both; `samples/tiny-house.ifcxml` is the same model written as IFC4
ifcXML (entity for entity, `iN` for `#N`) and `samples/tiny-house.ifczip` the
`.ifc` zipped by Python's `zipfile`.

No API key, account or server is involved, so there is nothing to configure.

### On every commit: GitHub Action, JUnit and annotations (2026-11-17)

A team that keeps its IFC exports and IDS files in a repository can check every
model against every IDS on each push or pull request. `action.yml` is a
composite action with no dependencies beyond the runner's Node (18+):

```yaml
# .github/workflows/ids.yml in your repository
on: [push, pull_request]
jobs:
  ids:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Duncan-Haywood/oss-monorepo/ventures/ids-model-check@main
        with:
          models: "models/**/*.{ifc,ifczip,ifcxml}"
          ids: "requirements/*.ids"
          # pairing: name     # wall.ifc only against wall*.ids
          # fail-on: warning  # also fail on optional specifications
          # fail-on-unchecked: true  # also fail when IFCWALL left IfcWallStandardCase unchecked
          # fail-on-audit-warnings: true  # also fail on IDS audit warnings (an abstract class, ...)
          bcf-dir: bcf        # one BCF 2.1 file per failing pair
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: ids-report
          path: |
            ids-report.xml
            bcf/
```

It writes a JUnit report (`ids-report.xml`, one test case per specification,
read by GitHub test-report actions, GitLab, Jenkins and Azure DevOps), a job
summary table, an annotation per failing specification placed on the first
failing element's `#id=` line of a STEP model, and the outputs `result`,
`passed`, `failed`, `warnings`, `invalid`, `elements-failed`, `not-checked` and `audit-warnings`. Required and
prohibited failures, invalid specifications and unreadable files fail the step;
optional ones are warnings unless `fail-on: warning`; `fail-on: never` only
reports. IDS has no inheritance, so a specification naming `IFCWALL` never
looks at an `IfcWallStandardCase` (most walls in Revit's IFC2X3 exports); the
verdict stands, and since 2026-11-17 every CI output says how many elements
were left out (a warning annotation on the IDS file, the JUnit test case's
`system-out`, a "Not checked" column and list in the job summary, the
`not-checked` output). `fail-on-unchecked: true` (`--fail-on-unchecked`) fails
the step on them instead (`eval/ci-unchecked-2026-11-17.md`).

IDS audit warnings (since 2026-11-17, `eval/ci-audit-annotations-2026-11-17.md`)
are about the IDS, not the model: a specification that is valid but probably
does not check what its author meant, such as an entity facet naming the
abstract `IFCBUILDINGELEMENT` (it selects nothing), a property value with no
`dataType`, or a non-standard `Pset_` property. CI annotates each one on the
IDS file, on the line of that `<specification>` tag, once per IDS file however
many models it was checked against, and so does an invalid specification. Past
nine specifications (GitHub shows ten warnings per step and drops the rest
silently) the others fold into one annotation pointing at the job summary,
which lists them all. They also appear in the JUnit test case's `system-out`,
the console and the `audit-warnings` output. The verdict stands;
`fail-on-audit-warnings: true` (`--fail-on-audit-warnings`) fails the step on
them. A glob that matches nothing exits 2 rather than passing an empty
check. Pinning `@main` follows this repository; pin a commit SHA for a
repeatable build, or copy the folder (it runs from its own directory).

In GitLab, `--gitlab-codequality gl-code-quality-report.json` writes a Code
Quality report (since 2026-11-17, `eval/gitlab-codequality-2026-11-17.md`):
one issue per failing element on its `#id=` line, IDS audit warnings and
invalid specifications on the specification's line, and each element's
fingerprint built from its GlobalId and class, not its `#id`. The merge
request widget then says which elements a change broke or fixed. On the HHS
Office revisions in `opensourceBIM/IFC-files` it showed exactly the 2 and 16
changed failures, and 0 for BIMserver's re-serialisation of the MEP model,
which renumbers all 665,224 entities (keyed on `#id`, that re-save would show
8,975 new and 8,975 fixed). Every listed element gets an issue by default;
`--gitlab-max-per-spec N` caps it for size, but a cap of 50 hid all 18 real
changes there.

```yaml
ids-check:
  image: node:22
  script:
    - node ids-model-check/ci-cli.mjs --models "models/**/*.ifc" --ids "requirements/*.ids"
        --junit ids-report.xml --gitlab-codequality gl-code-quality-report.json
  artifacts:
    when: always
    reports:
      junit: ids-report.xml
      codequality: gl-code-quality-report.json
```

Outside GitHub the same entry point runs anywhere Node does (GitLab CI,
Jenkins, a pre-commit hook):

```
node ci-cli.mjs --models "models/**/*.ifc" --ids "req/*.ids" --junit report.xml \
  [--summary summary.md] [--bcf-dir bcf/] [--json results.json] [--annotations] \
  [--pairing all|name] [--fail-on error|warning|never] [--fail-on-unchecked] \
  [--fail-on-audit-warnings] [--root DIR] [--max-failures N] \
  [--gitlab-codequality FILE] [--gitlab-max-per-spec N]
node cli.mjs model.ifc spec.ids --junit report.xml   # one pair
```

Measured on four real exports (`eval/ci-action-2026-11-17.md`): 4 models (76 MB)
against the two starter IDS files, 8 pairs, in 7.3-7.7 s on Node 22; 16
annotations, every one of the 9 with a line number on the failing element's own
line; JUnit valid XML. GitHub shows at most ten error annotations per step, so
the job summary and JUnit file carry the full list.

Since 2026-11-17 (`eval/ci-scale-2026-11-17.md`) each model and each IDS is
parsed once however many pairs it is in: the same 8 pairs take 4.3-4.8 s
instead of 7.3-8.7 s, and 14 public IDS files against the four exports (56
pairs) take 7.5-8.0 s instead of 48.6-48.9 s, with identical output. Each specification's report keeps
its first 1,000 failing elements (`--max-failures` / `max-failures`; counts
stay exact), because a public IDS whose specification has no entity facet
applies to all 665,224 entities of the HHS MEP export and held ~440 MB of
failure text per specification, so 16 public IDS files against the four
exports ran Node out of memory; they now take 45 s at a 1.5 GB peak. A
truncated IDS, ifcXML or STEP file used to loop forever (in the page as well);
it now fails its own pairs with "unterminated ...".

Since 2026-11-17 (`eval/heap-200mb-2026-11-17.md`) an entity's arguments are
read when a check first needs them and geometry's are not kept: a 219 MB
federated model of seven real exports is checked against the starter IDS
files in 7.5-7.8 s at a 1,010 MB peak, where it took 12.3 s and 2.5 GB, with
identical reports; the page now finishes it under a 1 GB heap, where the tab
used to crash.

Since 2026-11-17 (`eval/no-entity-facet-2026-11-17.md`) a specification that
applies to every entity (no entity facet, or an entity name pattern matching
any class, as 37 specifications in public IDS files do) skips what cannot
match without reading arguments, judges requirements before writing failure
text, and reads the IFC2X3 type mapping table from an index. The 68 public and
starter IDS files take 13.3 s on the HHS MEP export, where they took 96.2 s,
and 111 s on the 219 MB federated model, where they took 515 s. Every report
is identical. The 4.7 GB peak that run showed was garbage not yet collected:
with a 2 GB heap it finishes, before and after this change.

## How it was checked

1. **buildingSMART's test suite.** `eval/fetch-testcases.sh` sparse-clones
   `github.com/buildingSMART/IDS` at commit `870f9c4` and
   `node eval/run-testcases.mjs` scores every pair: `pass-*` must pass,
   `fail-*` and `invalid-*` must not. Result, 2026-11-16:

   | facet | right |
   | --- | --- |
   | attribute | 56 / 56 |
   | classification | 27 / 27 |
   | entity | 33 / 33 |
   | ids | 12 / 12 |
   | material | 29 / 29 |
   | partof | 34 / 34 |
   | property | 82 / 82 |
   | restriction | 25 / 25 |
   | tolerance | 36 / 36 |
   | **total** | **334 / 334** |

   The first run scored 309 / 334; the 25 misses were fixed one rule at a time
   (inclusive tolerance bounds, `ifcVersion` being metadata only, empty string
   vs null under optional facets, logical UNKNOWN, classification systems,
   bounded and table properties, USERDEFINED predefined types). The suite is
   CC BY-ND 4.0, so it is fetched, not committed.

   For comparison, `eval/score_ifctester.py` scores IfcTester 0.9.0.post1 (the
   PyPI release) on the same suite revision: **312 / 334** (misses: 14
   tolerance-boundary cases, the two "patterns work in OR" cases, one optional
   null attribute, one optionality combination, two integer-with-decimal
   cases, one IFC2X3 extended material property case that raises). IfcTester's
   main branch may already fix some of these; the release was what was tested.

2. **Real models against IfcTester.** `eval/crosscheck_ifctester.py SPEC.ids
   MODEL.ifc ...` runs both checkers and compares each specification's
   verdict, applicable count and set of failing element ids. Models: the
   Schultz Residence (OpeningDesign, IFC2X3 Revit export, 22 MB; CC BY-ND, from
   `opensourceBIM/IFC-files`, not committed), buildingSMART's simple scene in
   IFC2X3 and IFC4X3 and wall-with-opening in IFC4 (the fixtures in
   `../wall-framing-takeoff/fixtures/`), the `research/house-open-design` ADU,
   and `samples/tiny-house.ifc`. With `samples/coordination-basics.ids.xml`: all
   42 specification results identical. With `samples/quantities-and-naming.ids.xml`:
   identical except the naming-pattern specification, which has two
   `xs:pattern`s. XSD (Part 2, 4.3.4) says several patterns in one restriction
   are alternatives, and buildingSMART's `regex_patterns_work_in_OR` cases
   expect that; IfcTester 0.9.0.post1 requires all of them to match, so it
   fails every wall there and this checker does not.

   IFC 4.3 infrastructure and MEP (2026-11-17,
   `eval/infra-mep-crosscheck-2026-11-17.md`): buildingSMART's ten IFC 4.3
   Simple-Scene models (bridge, road, rail, earthworks, plumbing, electrical,
   landscaping, HVAC) and its HVAC model in IFC4 and IFC2X3, with the two
   starters and `samples/infrastructure-and-mep.ids.xml` (18 specifications:
   predefined types from type objects, `partOf` through the bridge, road and
   railway trees, millimetre quantities compared in metres). 348 of 348
   results identical, element by element, with IfcTester 0.8.0; the verdicts
   were also checked against the data with IfcOpenShell. The only differences
   (3) are on the IFC2X3 copy: its air terminals and duct are `IfcFlowTerminal`
   and `IfcFlowSegment` typed by `IfcAirTerminalType` and `IfcDuctSegmentType`;
   this checker maps them to IFCAIRTERMINAL and IFCDUCTSEGMENT (buildingSMART's
   type mapping table) and IfcTester 0.8.0 finds nothing applicable.
   `infra.test.mjs` pins the counts on three committed models
   (`samples/bsi-ifc43/`, CC BY 4.0).

   Public IDS files on real exports (2026-11-17,
   `eval/corpus-crosscheck-2026-11-17.md`): the 65 public IDS files on the four
   `opensourceBIM/IFC-files` exports. IfcTester 0.9.0 could not open 12 of
   them; on the other 53, 1,661 of 1,736 specification results identical. All
   75 differences have one of three causes: IfcTester takes an IFC2X3
   `IfcWallStandardCase` typed by an `IfcWallType` as `IFCWALL` (50; IDS has no
   inheritance, so this checker does not), a prohibited specification with
   requirements, which buildingSMART's suite calls invalid (16), and an untyped
   `True` on a boolean (9; the audit warns). The run found that on the HHS
   models, whose 112 standard-case walls have no type object, *both* checkers
   skip them, so the report now counts what an entity facet leaves out (below,
   "Entity facet").

3. **The IDS audit** (`audit.mjs`, 2026-11-16). The same script prints a
   strict score: an `invalid-*` pair must come back INVALID (not merely not
   passing), and a `pass-*` or `fail-*` pair must come back exactly pass or
   fail, so the audit may not call a valid IDS invalid. Result: **333 / 334**;
   26 of 27 invalid files flagged, 0 of 307 valid files flagged. What it
   catches:

   | check | suite files it flags |
   | --- | --- |
   | class not in the schema, or not upper case (`IFCRABBIT`, `IfcWall`) | 2 |
   | required entity no applicable class can be (applicability `IFCSLAB`, requirement `IFCWALL`; a subclass is not its parent) | 4 |
   | attribute the class lacks, or has only as derived or inverse (`ActingRole` on a wall, `Dim`, `EngagedIn`) | 3 |
   | value compared with a list, an object or a select | 3 |
   | literal IDS cannot read for the type: `42,3`, `123,4.5` for a real; `42.`, `42.0`, `42.3` for an integer; `FALSE` for a boolean; a pattern on a number | 13 |
   | prohibited specification with requirements | 1 |

   It also checks `dataType` names, `partOf` relations, `ifcVersion` values and
   regular expressions, and warns (without changing the verdict) about a
   predefined type outside the class's enumeration, an enumeration value no
   member can equal, and a property value with no `dataType`. The one file it
   does not flag, `partof/invalid-a_group_predefined_type_must_match_exactly_1_2`,
   asks for group predefined type `BUNNARY`; the IDS alone cannot tell that
   from the valid `BUNNY` of its sibling case, because a custom predefined type
   is legal for USERDEFINED groups (the audit warns). A specification is
   audited against every schema its `ifcVersion` names and is invalid only if
   it is invalid in all of them. False-alarm check on files written by others:
   the 12 example IDS files in buildingSMART's `Documentation/Examples` (38
   specifications, Aedes, ArcDox, SimpleBIM, OMA, prefab pipes in IFC2X3 and
   IFC4.3, wooden windows and others) give 0 errors and 0 warnings.

4. **Property set templates in the audit** (2026-11-16). `schema/gen-psets.mjs`
   reduces buildingSMART's property set definitions to `schema/psets-*.json`:
   IFC2X3 and IFC4 from the PSD XML files in `buildingSMART/IFC4.3.x-development`
   (`reference_schemas/psd_IFC2x3`, `psd_IFC4_ADD2_TC1`), IFC4X3 from
   IfcOpenShell's `Pset_IFC4X3.ifc` (`FILE_SCHEMA IFC4X3_ADD2`), because that
   repository's `psd` folder is the IFC4x3 RC4 draft (it still applies
   `Pset_SolidStratumCapacity` to `IfcSolidStratum`, a class ADD2 renamed, and
   lacks `Pset_BuildingStoreyCommon.ElevationOfFFLRelative`, which ADD2 has).
   The two independent sources were compared where both exist: IFC2X3 317 of
   317 sets, 1,832 of 1,832 properties and 1,485 of 1,485 data types agree;
   IFC4 513 of 513 sets, 2,723 of 2,726 properties and 2,362 of 2,363 types
   (IfcOpenShell gives `Pset_AirTerminalOccurrence.AirflowType` its enumeration
   name instead of `IfcLabel`). IFC4X3: 760 sets, every class and type in the
   ADD2 schema.

   The rules follow buildingSMART's IDS-Audit-tool, which the user manual
   backs ("these prefixes are prohibited for custom properties"): a `Pset_` or
   `Qto_` set the templates lack, a property its standard set lacks, a
   `dataType` the template does not give (a table property allows its defining
   or defined type), and a required set the applicability's classes cannot
   carry (`Pset_WallCommon` on `IFCCOVERING`; a type object carries its
   occurrence's sets, and an occurrence its type's, so IFC2X3's
   `Pset_AirTerminalTypeCommon` on `IFCAIRTERMINAL` is valid) are errors. A value outside a standard enumeration is a
   warning. As everywhere in the audit, a specification is invalid only if it
   is invalid in every schema its `ifcVersion` names.

   `eval/fetch-audit-corpus.sh` then `node eval/audit-corpus.mjs`:

   - **IDS-Audit-tool test files** (`buildingSMART/IDS-Audit-tool`,
     `testing.shared`, commit `fdfc562`): all five that test property sets
     (`InvalidCustomPsetBecauseOfPrefix`, `InvalidIfcPropertyInPset`,
     `InvalidMeasureForStandardPsetProperty`, `InvalidIfcPropertyForType`, and
     `InvalidIfcOccurs`, whose `Pset_WallCommon.Reference` is written
     `IFCLABEL`, not `IFCIDENTIFIER`) read INVALID. Of its 9 valid files, 8 audit
     clean. The ninth, `IDS_aachen_example`, asks for attribute `name` in lower
     case; IFC attributes are `Name`, and this checker matches names exactly,
     as buildingSMART's own test cases do, so it keeps calling it invalid. Of
     its 34 other invalid files, 4 are refused before the audit (not XML, not
     IDS), 12 read invalid, and most of the other 18 are invalid only by the
     IDS XML schema (cardinality attributes, empty elements), which this audit
     does not check.
   - **buildingSMART's suite and examples** are unchanged: 333 / 334 strict,
     0 of 307 valid files flagged; the 12 example IDS files still give 0 errors
     and 0 warnings.
   - **65 real IDS files** from public GitHub repositories, found by code
     search on 2026-11-16 (`eval/real-ids-files.txt`: national and municipal
     requirement sets, research projects, tool samples). 64 parse (one is not
     well-formed XML), with 507 specifications; 21 have a template finding. Read one by one, each is a real departure from the standard:
     typos (`Lenght` in `Qto_RailingBaseQuantities`,
     `Qto_DuctSegmentBaseQuantities` and `Qto_CableCarrierSegmentBaseQuantities`
     in buildingSMART Portugal's EIR files; `AkousticRating` in four sets of a
     Rotterdam permit-check IDS; `Thermal Transmitance`); quantities typed
     `IFCREAL` instead of their measure (buildingSMART Spain's
     `Qto_SpaceBaseQuantities`); IFC2X3 `IfcIdentifier` properties written
     `IFCLABEL` or `IFCTEXT`; and project properties put into standard sets
     (`Pset_DoorCommon.Entrance`, `Pset_Condition.RenovationStatus` in the Dutch
     BIM basis ILS) or project sets given the reserved prefix (`Pset_IBRO`).

   Because a project's model can carry exactly what such an IDS asks for, a
   **model check still runs** a specification whose only fault is a template
   one and shows it as a warning ("not standard IFC"); the audit on its own
   calls the IDS invalid, as the IDS-Audit-tool does.

   Two fixes came out of the same files: a date, time or duration range
   (`minInclusive="2052-08-11"`, `maxExclusive="PT5M30S"`) was called invalid
   and could never match; both sides are now compared in ISO order
   (`temporal.mjs`), while `1 day` or `7:35 PM` stays invalid. And a pattern on
   a boolean, which IDS's data type table allows, is matched against `true` or
   `false` instead of being called invalid.

5. **Unit tests** (`node --test`): STEP and XML readers, tolerance, patterns,
   unit conversion, type inheritance and overrides, cardinality, the sample
   model's known gaps, CSV formula neutralising, and BCF zip structure (and an
   `unzip` round trip when it is installed). The suite test runs when
   `eval/IDS` has been fetched. With `eval/fetch-bcf-schemas.sh` run and
   `xmllint` installed, every file of a sample BCF export is also validated
   against buildingSMART's BCF 2.1 schemas (CC BY-ND, fetched, not
   committed). That check found, on 2026-11-17, that every `markup.bcf` wrote
   an empty `IfcProject=""` the schema rejects, and that a control character
   in an IFC name made the markup unreadable XML; both are fixed.

6. **ifcXML and `.ifczip` on real files** (2026-11-16,
   `eval/ifcxml-xbim-2026-11-16.md`). `eval/fetch-xbim-samples.sh` fetches the
   ifcXML and ifcZIP test files from xBIM's XbimEssentials (CDDL, so fetched, not
   committed; commit `e3c8777`) and `node eval/ifcxml-xbim.mjs` reads all 16
   files with no reader errors beyond one `ref` the file itself leaves
   dangling. They hold 9 distinct ifcXML documents: IFC2X3 from Revit through
   xBIM, from IFC Engine DLL and one of unstated origin; IFC4 from xBIM,
   Constructivity, eTASK's CAFM API, a hand-edited CEN TC 442 sample and two
   small hand-written ones, between them using the IFC4 layout's shortcuts
   (nesting, attribute elements with `xsi:type`, implicit classes, string ids).
   The 7 zips' entries are byte-identical to `unzip -p`, one with zip64
   size fields. The one pair that exists, the Revit model `4walls1floorSite`
   as STEP and as xBIM's ifcXML export, reads to the same 579 entities with
   2,205 of 2,205 attribute values identical, and the starter IDS gives the
   same verdicts on both. Unit tests add the IFC4 twin of the sample (319 of
   319 values, same verdicts for both starter IDS files) and zips written
   stored, deflated and zip64. In Chromium the page reads the `.ifczip` with
   `DecompressionStream` and gives the `.ifc`'s verdicts.

Speed (one core, Node 22): Schultz Residence 1.4 s for seven specifications;
IfcTester (C++ parser) took 0.6-0.7 s for the same work. This tool is not
faster than IfcTester; its point is needing no install.

## Model notes and choices

- **Entity facet:** exact class, no subclasses (the report counts, per
  specification, the elements of subclasses the facet does not name that would
  otherwise apply, e.g. "not checked: 101 IFCWALLSTANDARDCASE (a subclass of
  IFCWALL)", without changing the verdict; a prohibited specification made
  invalid by its requirements says how many elements match it); the predefined type is read from
  the type object first (`ElementType`/`ProcessType`/`ResourceType` when
  USERDEFINED), then the occurrence (`ObjectType` when USERDEFINED). An IDS may
  also name `USERDEFINED` itself.
- **Attribute facet:** null is absent (an optional facet passes); an empty
  string, empty list or logical UNKNOWN is present but fails; derived and
  inverse attributes cannot be checked; values of object references, lists and
  selects cannot be compared.
- **Property facet:** type property sets are inherited and an occurrence set of
  the same name overrides per property; quantities count as properties;
  material properties (`IfcMaterialProperties`, IFC2X3
  `IfcExtendedMaterialProperties`) and predefined property sets are read;
  reference and complex properties are not supported (fail). With a
  `dataType`, only values of that type are compared. Measures are converted to
  SI from the property's unit or the project unit before comparing (SI prefixes,
  squared and cubed units, conversion-based units such as feet, Celsius offset;
  derived units are taken as SI).
- **Bounded properties:** a single IDS value must equal the lower bound, the
  upper bound or the set point; a range restriction needs both bounds inside
  it. The user manual's table instead says a single value inside the bounds
  passes; buildingSMART's `any_matching_value_in_a_bounded_property` cases say
  otherwise (2 against 1..5 with set point 3 must fail), and the suite wins.
- **Classification:** an occurrence's reference in a system replaces its type's
  reference in that system; a value matches the reference's code or any parent
  reference's code (EF_25_10 matches an EF_25_10_25 whose parent is EF_25_10).
- **Material:** names and categories of the material, layer set and layers,
  profile set and profiles, constituent set and constituents, and lists; an
  occurrence's material replaces its type's.
- **Part of:** aggregation, grouping, containment, nesting, voids and fills,
  each followed recursively; containment also climbs the container's
  aggregation (space, storey, building, site). IDS 1.0 names voids and fills
  as one relation value, the token pair `IFCRELVOIDSELEMENT IFCRELFILLSELEMENT`:
  a door filling an opening in a wall is part of the wall (the opening is the
  path, not the whole), as IfcTester reads it. Until 2026-11-16 this checker
  read that value as one unknown relation and the audit called it invalid, while
  accepting the two tokens on their own, which `ids.xsd` refuses; buildingSMART's
  test suite has no voids/fills case, so 334 of 334 did not show it.
- **ifcVersion** on a specification is metadata: the check runs anyway and the
  report warns.

## Limitations

- ifcJSON is not read. ifcXML is checked on 9 real documents from about
  seven exporters, not on every tool's output; the ifcXML reader holds the whole
  XML tree in memory, a few times the heap of the same model as STEP.
- The model's text is held in memory with a small record per entity; an
  entity's arguments are read when a check first needs them, and geometry's
  are not kept (2026-11-17, `eval/heap-200mb-2026-11-17.md`). A 219 MB
  federated model built from seven real exports peaks at about 1 GB with the
  starter IDS files, where reading every argument up front took 2.5 GB, and
  with all 68 public and starter IDS files it finishes under a 2 GB heap
  (`eval/no-entity-facet-2026-11-17.md`; the 4.7 GB peak without a cap was
  uncollected garbage), not under 1 GB. A requirement on
  attribute values by a name pattern still reads every entity's values,
  geometry included. Models well past 500 MB may need the command line with
  `--max-old-space-size`. The ifcXML reader still reads everything up front.
- The IDS audit does not validate the file against the IDS XML schema
  (cardinality attributes, element order); the IDS-Audit-tool does. Property
  set templates are checked for names, data types and applicable classes, not
  for predefined types (`IfcSlab/TRACKSLAB` sets are allowed on any slab) or
  property set template types (occurrence versus type driven).
- Tested on five real models (and 65 public IDS files on four of them); every BIM authoring tool writes IFC a little
  differently, so check surprising results and report them.

## Next steps

- The editor (own sets and a loaded model's classes and sets landed
  2026-11-16, `eval/model-inventory-2026-11-16.md`; several classes per
  specification 2026-11-17, `eval/several-classes-2026-11-17.md`; a model's
  property values 2026-11-17; attribute values and classification codes
  2026-11-17, `eval/model-attr-codes-2026-11-17.md`;
  applicability rows 2026-11-17, `eval/applicability-rows-2026-11-17.md`;
  numeric attribute ranges 2026-11-17, `eval/model-attr-ranges-2026-11-17.md`;
  untyped value rows 2026-11-17, `eval/untyped-values-2026-11-17.md`;
  exclusive bounds 2026-11-17, `eval/exclusive-bounds-2026-11-17.md`;
  date and duration ranges 2026-11-17, `eval/date-ranges-2026-11-17.md`;
  the model's range on dates 2026-11-17, `eval/model-date-range-2026-11-17.md`;
  one-of rows on dates 2026-11-17, `eval/date-oneof-2026-11-17.md`;
  specifications with no class 2026-11-17, `eval/no-class-specs-2026-11-17.md`;
  one-of rows on numbers 2026-11-17, `eval/number-oneof-2026-11-17.md`;
  several IFC versions 2026-11-17, `eval/multi-version-2026-11-17.md`;
  the file's own dataType on a standard property 2026-11-17,
  `eval/template-type-2026-11-17.md`): a "did you mean" for a property the
  template lacks (Portugal's `Lenght` for Length, 8 facets);
  the 20 numeric lists on non-element attributes in no-class specifications; a real IFC4 export with dates to try the range on;
  a subclass checkbox per class, not only the first;
  a "fix the dataType" hint built from the 21
  of 122 standard properties real exports write in another type.
- More real models through the IfcTester cross-check: buildingSMART's IFC 4.3
  infrastructure and HVAC samples agree 348 of 348 (2026-11-17); next, an
  authoring tool's own IFC 4.3 export (Civil 3D, OpenRoads, Allplan Bridge)
  and a Revit MEP export with systems and ports.
- The GitHub Action (landed 2026-11-17; parse-once and failure cap 2026-11-17):
  a run on GitHub's own runner; a team's real repository of exports running it;
  a failure cap with a streamed "download all" in the browser page.

## Sources

- IFC EXPRESS schemas IFC2X3 TC1, IFC4 ADD2 TC1 and IFC4X3 ADD2, (c)
  buildingSMART International Limited, whose notice allows use in software
  development with full attribution; read from the copies in
  `ThatOpen/engine_web-ifc` (`src/schema-generator/*.exp`) and reduced to
  `schema/*.json` by `schema/gen-schema.mjs`.
- `schema/ifc2x3-type-map.json` and `schema/measure-units.json` are fact tables
  read from buildingSMART's IDS documentation (IFC2X3 occurrence-type mapping
  table; units table).
- IDS 1.0 user manual, implementer documentation and test cases:
  `github.com/buildingSMART/IDS` (CC BY-ND 4.0; not copied here).
- Property set templates: buildingSMART's PSD XML files for IFC2X3 TC1 and
  IFC4 ADD2 TC1 (`github.com/buildingSMART/IFC4.3.x-development`,
  `reference_schemas/`, commit `c692856`) and, for IFC4X3 ADD2, IfcOpenShell's
  `Pset_IFC4X3.ifc` template file (`src/ifcopenshell-python/ifcopenshell/util/schema/`,
  commit `7092a6a`), whose content is buildingSMART's; (c) buildingSMART
  International Limited, used in software development with full attribution.
  Reduced to names, applicable classes, data types and enumeration items in
  `schema/psets-*.json` by `schema/gen-psets.mjs`.
- IDS-Audit-tool test files: buildingSMART, `github.com/buildingSMART/IDS-Audit-tool`
  (MIT; fetched by `eval/fetch-audit-corpus.sh`, not copied here).
- IfcTester: IfcOpenShell project, `pypi.org/project/ifctester`.
- ifcXML and ifcZIP test files: xBIM Toolkit, `github.com/xBimTeam/XbimEssentials`
  (`Tests/TestFiles`, CDDL; fetched by `eval/fetch-xbim-samples.sh`, not
  copied here).

IDS is a buildingSMART International standard. This tool is independent and
not endorsed by buildingSMART.

## Disclaimer

Provided free and as-is, without warranty of any kind. A passing check means
the model meets the IDS as this software reads it. It is not a design review,
a code-compliance check or professional advice, and it does not replace the
judgment of the architect, engineer or BIM manager responsible for the model.

## License

MIT, see `LICENSE`.
