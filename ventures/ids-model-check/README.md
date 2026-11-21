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
- **ifcJSON** (2026-11-21, `ifcjson.mjs`): buildingSMART's draft JSON form of
  IFC, as IfcOpenShell's ifc2json and the IFC.JAVA converter write it (header
  or none, `{"ref"}` links or bare ids, relationships nested under inverse
  attributes, UUID GlobalIds turned back into IFC's 22 characters). On the 97
  STEP/ifcJSON twins in buildingSMART's ifcJSON repository the starter IDS
  verdicts agree 291 of 291, and with 65 public IDS files 6,552 of 6,596
  agree on status and failing GlobalIds; every difference left traces to what
  a converter left out (empty strings, empty properties, objects reached only
  through inverses), read by hand (`eval/ifcjson-twins-2026-11-21.md`).
- **IFC5 alpha** (2026-11-21, `ifcx.mjs`): buildingSMART's `.ifcx` files
  (IFC5-development examples), composed from their nodes (later nodes win,
  `inherits` brings a type's or material's attributes, `null` removes) into
  IFC4X3 objects, spatial tree, property sets, classifications and materials,
  so every facet checks them. IFC5 keeps no property set names, so each
  property goes to the standard set whose template names it for the class
  (IsExternal on a wall: Pset_WallCommon; Height: Qto_WallBaseQuantities),
  else to a set named after its namespace (`bsi::ifc::prop`). Layers compose
  weakest first (`--layer` on the CLI). On the 8 public STEP/IFC5 twins,
  classes agree on 12,115 of 12,116 paired objects and partOf links 1,646 of
  1,648; every property and material the IFC5 file shares with its STEP twin
  lands in the same set with the same value; all 47 public `.ifcx` files read
  (TeklaHouse, 42 MB, in 0.5 s). IFC5 alpha has no Name attribute: Name is
  the key the parent gives the object (`SLB_150` for STEP's `SLB-150`)
  (`eval/ifcx-twins-2026-11-21.md`). **Systems** (2026-11-21, later the same
  day): `bsi::ifc::system::partofsystem` becomes IfcRelAssignsToGroup, so an
  IDS `partOf relation="IFCRELASSIGNSTOGROUP"` (pipes in a distribution
  system) checks on `.ifcx` too; `connectsto` becomes one IfcRelConnectsPorts
  per port pair, `flowdirection` a port's FlowDirection, `servicesfacility`
  IfcRelServicesBuildings; a system is no longer put in the spatial tree. On
  the Domestic Hot Water twin: 9 of 9 system members, 35 of 35 port
  directions and 15 of 15 connected port pairs match STEP, partOf across the
  8 twins 1,655 of 1,657 (`eval/ifcx-systems-2026-11-21.md`).
- STEP `.ifc`, ifcXML (`.ifcxml`, both the IFC2X3 and IFC4 layouts) and `.ifczip`
  (any of them zipped), read into the same entities: xBIM's ifcXML export of a
  Revit model agrees with its STEP file on 2,205 of 2,205 attribute values, and
  on 43 STEP/ifcXML twins (buildingSMART's IFC4 Annex E examples and two
  GeometryGymIFC examples) the checker gives the same verdicts on both forms, 129 of
  129 (`eval/ifcxml-twins-2026-11-18.md`).
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
- **Sets for one predefined type** (2026-11-19): the IFC4 and IFC4X3 templates
  give 186 of 513 and 343 of 760 standard sets only to some predefined types
  (`Pset_ActuatorTypeElectricActuator` is for `IfcActuator/ELECTRICACTUATOR`,
  `Pset_SolidStratumCapacity` for `IfcGeotechnicalStratum/SOLID`). A
  specification that requires one with no predefinedType, or with another
  type, asks the other objects for a set the standard never gives them: the
  audit warns (`pset-predefined`) and names the type to add. The editor marks
  such sets "(ELECTRICACTUATOR only)", fills in the type when a set has one,
  and stops offering a set once another type is chosen. All 1,008 limited
  class/set pairs the editor offers draw the warning with no type and audit
  clean with theirs (`eval/predefined-sets-2026-11-19.md`); 1 of 65 public IDS
  files has one, sand strata picked by material.
- **Where a set may sit** (2026-11-19): the templates' own template type
  says whether a set goes on occurrences only (`PSET_OCCURRENCEDRIVEN`, 16 IFC4
  and 105 IFC4X3 sets such as `Pset_FanOccurrence`; 14 IFC4X3 quantity sets),
  or on the `IfcPerformanceHistory` that records an element's performance over
  time (`PSET_PERFORMANCEDRIVEN`, 42 and 44 sets such as `Pset_FanPHistory`). A
  specification requiring an occurrence set on a type object (`IFCFANTYPE`)
  draws `pset-occurrence` and names the occurrence class; one requiring a
  performance set on the element draws `pset-performance`. Requiring a
  performance set on `IFCPERFORMANCEHISTORY`, where the standard puts it, was a
  false `pset-class` error and now audits clean. The editor no longer offers
  occurrence sets on type objects (647 pairs) and offers performance sets on
  `IFCPERFORMANCEHISTORY` instead of the element. All 1,280 such pairs the
  editor used to offer agree with the audit, and every pair it offers now
  draws neither warning (`eval/template-types-2026-11-19.md`). No public IDS
  file of the 65 read has either case.
- **IDS editor** (`editor.html`, 2026-11-16): pick a class, then a standard
  set that class can carry, then a property; the editor writes the template's
  `dataType`, offers the standard's enumeration values, lists subclasses (IDS
  matches exact classes) and audits the IDS live. Every choice it offers was
  written out and audited: 203,433 specifications across the three schemas,
  none with an error or a warning (2026-11-16; since 2026-11-19 a set limited
  to some predefined types warns until the type is set, and the editor fills
  it in for a one-type set); a 15,102-specification sample validates
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
  **A subclass box per class** (2026-11-18): every further class gets its own
  "and its subclasses" box, not only the first, and an opened class list that
  names a class with all its concrete subclasses opens with that box ticked
  (`classListBases`). The two 147-class bSDD-Toolkit templates open as 79
  classes, 11 ticked; on the public files the names listed fall from 506 to
  368, every file still writing back the same.
  `eval/also-subclasses-2026-11-18.md`.
  **Deprecated subclasses** (2026-11-19): in IFC4X3 a ticked box leaves out
  the classes IFC 4.3 deprecates (`IFCWALLSTANDARDCASE`,
  `IFCELECTRICDISTRIBUTIONBOARD`) and names them beside the box; IFC4 keeps
  them. 57 public IFC4X3 exports hold none (IFC4 exports: 151 of 572 walls), a
  model that does carry one still gets the "would not check" warning, and the
  bSDD templates now open as 30 classes, `IFCBUILTELEMENT` ticked; public files
  list 270 names (was 368), all writing back the same.
  `eval/deprecated-subclasses-2026-11-19.md`.
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
  failing doors. Since 2026-11-20 the pattern is exact, not a shape: only
  days that exist (no 2024-02-30), ASCII digits (XSD's `\d` takes any
  Unicode digit), and a date written with a time zone placed by its instant
  as the range places it; on 31 doors built on those differences the old
  pattern differed from the range on 50 of 310 verdicts, the new one on 0,
  and IfcTester 0.9.0 agrees with it on 10 of 10
  (`eval/date-pattern-exact-2026-11-20.md`). Since 2026-11-21 dateTime
  ranges get the button too (`dateTimePattern`): one pattern exact to the
  millisecond (Date.parse keeps three fraction digits, so `.9999` is `.999`),
  `24:00:00` read as the next midnight, and a value written in any of the 44
  UTC offsets time zones used from 2000 to 2026 placed by its instant; an
  offset no zone uses (`+10:17`) passes only more than a day inside the
  range. On 31 beams built on those edges the pattern differs from the range
  on 0 of 290 verdicts (3 of 20 at `+10:17`), IfcTester 0.9.0 fails all 31
  on every dateTime range and agrees with the pattern on 10 of 10; patterns
  run 2.9 to 16.3 kB (`eval/datetime-pattern-2026-11-21.md`). Later that
  day the checker began ordering dateTimes and times past the millisecond
  (`temporalCompare`, as XSD does: `07:00:00.0001` now passes `> 07:00:00`;
  .NET exporters write seven fraction digits), and the pattern follows the
  whole fraction: still 0 of 290 verdicts unlike the range, IfcTester 10 of 10.
  Time ranges (`xs:time`, IFCTIME: `Pset_WorkControlCommon.WorkStartTime`)
  get the button too since 2026-11-21 (`timePattern`); the checker now reads a
  time of `24:00:00` as `00:00:00`, as XSD does (it used to pass no range of
  times of day). On 32 work schedules the pattern differs from the range on 0
  of 300 verdicts (9 of 20 at `+10:17`), IfcTester 0.9.0 fails all 32 on every
  time range and agrees with the pattern on 10 of 10
  (`eval/time-pattern-2026-11-21.md`). Presence-only standard properties with no dataType now open
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
  **Numbers with no class named** (2026-11-17): an attribute stored as a
  number on one class and derived on a subclass (CoordinateSpaceDimension,
  Precision) opens as a number row that names the subclass, whose objects
  never hold a value. A file's `xs:integer` on an IfcCountMeasure (a NUMBER:
  BarCount, CountValue) is kept as written. A value on an attribute that is
  a list on every class (TexCoordsList, DayComponent) stays held, and the
  audit warns that every object it checks fails. 117 of 129 numeric lists
  open (was 109); the 12 left are those lists; IDS-Audit-tool valid files
  90.7% editable. `eval/no-class-numbers-2026-11-17.md`.
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
| Excel2IDS (buildingSMART community) | free, GPL-3.0 | Windows .exe to turn its Excel template into IDS; no checking, cannot read an IDS back |
| **IDS Model Check** | free, MIT | a browser tab; or Node for CI |

What this does better: nothing to install, nothing uploaded (the model is read
by JavaScript in the tab), a BCF export so failures go straight back into Revit,
Archicad, Navisworks or BIMcollab as issues, and a dependency-free engine that
drops into a CI job (`node cli.mjs model.ifc spec.ids` exits 1 on a fail).

## Run it

Browser: open `index.html` (the checker), `editor.html` (the IDS editor) or `revision.html` (compare two IDS versions) through any static server (`npx serve .` or
`python3 -m http.server`), drop a model and an IDS. The page loads only its own
`schema/*.json` tables.

Command line (Node 20+):

```
node cli.mjs model.ifc spec.ids                 # text report, exit 1 on a fail
node cli.mjs model.ifcxml spec.ids              # ifcXML, or an .ifczip, the same way
node cli.mjs model.ifc spec.ids --json          # full report
node cli.mjs model.ifc spec.ids --html report.html  # the check as one HTML file to send back
node cli.mjs model.ifc spec.ids --bcf out.bcfzip --max-failures 20
node cli.mjs --audit spec.ids                   # is the IDS itself valid? exit 1 if not
node cli.mjs --audit spec.ids --bsdd            # also look each facet uri up in bSDD (goes online)
node cli.mjs --link-bsdd spec.ids -o linked.ids    # add the IFC 4.3 bSDD uri to standard properties (offline)
node cli.mjs --from-bsdd https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/IfcDoor -o door.ids
                                                 # an IDS from a bSDD class's property list (goes online)
node cli.mjs --fix spec.ids -o spec-fixed.ids   # repair its ids.xsd faults; exit 1 if some need a person
node cli.mjs model.ifc spec.ids --no-audit      # run invalid specifications as written
node cli.mjs --to-sheet spec.ids -o spec.xlsx   # the IDS as a spreadsheet, one row per facet (or .csv)
node cli.mjs --from-sheet spec.xlsx -o spec.ids # a spreadsheet back to IDS 1.0; exit 1 names bad rows
node cli.mjs --diff old.ids new.ids [model.ifc]  # what a revision adds, removes, asks more or less of;
                                                 # with a model, elements newly failing; exit 1 if it asks more
node cli.mjs --to-doc spec.ids -o spec.html     # the IDS in plain English, printable (or .md; Markdown on stdout)
```

Comparing two versions of an IDS (2026-11-20, `revision.mjs`, page
`revision.html`, `cli.mjs --diff`): specifications pair by name, then by an
identical applicability (a rename), then by a leading section number (`3.3`,
`(3.3)`); facets pair by what they ask about (a property by set and name, an
attribute by name, a classification by system). Each change is graded for the
person who must meet the IDS: *asks more* (a new required facet, optional to
required, fewer enumerated values, a narrower numeric range, a data type
added, an applicability condition removed or more classes selected), *asks
less* (the reverse), *different* (neither contains the other: another
pattern, class or value, patterns compared as languages, below; to or from prohibited; a move to a number base) or
metadata (names, descriptions, IFC versions, bSDD links). With a model, both
versions are checked and elements are matched by GlobalId: newly failing,
already failing with a new reason, no longer failing; a side that is invalid
IDS is not run, so its elements are not compared. On 69 committed revisions
of 27 public IDS files in 6 GitHub repositories (of 13 searched): 0 errors,
185 of 233 changes graded asks more or less, 6 different, 42 metadata; 23
revisions changed nothing the checker reads. The DFE Education Estates Stage 4
to Stage 5 COBie IDS adds six required properties, four with `(?:` patterns
that are not XSD, so the Stage 5 specification is invalid as published; after
`--fix`, all 340 Schultz Residence elements it applies to were already failing
and gain the new requirements (eval/revision-diff-2026-11-20.md).

Patterns compared as languages (2026-11-20, `pattern-lang.mjs`): a pattern
edit is no longer "different" by default. Each restriction that is a set of
strings (patterns, enumerations, simple values and length facets in any mix,
on a non-numeric base) becomes automata over code-point intervals, parsed
with the XSD 1.0 grammar the checker matches with, and the diff decides
whether one side's strings all pass the other: `D-[0-9]+` to `D-[0-9]{2}` asks
more, `[0-9]{2}` to `[0-9][0-9]` is the same, `EI[0-9]+` to `REI[0-9]+` is
different. Each graded change names the shortest value that matched before
and not now, and the reverse ("e.g. "D-" matched before, not now"), which is
the value to look for in the model. Checked on the 60 XSD-valid patterns of
the public files: all 3,540 ordered pairs decided (1.3 s together), all 3,369
example values agree with the XSD matcher, and 13,389 strings sampled from
the 171 "within" verdicts' automata break none; 400 random patterns agree with
brute force over every string of up to 5 characters. No committed public
revision edits a pattern yet, so the 69-revision tally above is unchanged.
The audit uses the same automata for `value-never` when a restriction's
list, pattern and length limits never agree (an enumeration of `EI 30` with
the pattern `EI[0-9]+`; `[A-Z]{3}-[0-9]{3}` with maxLength 6): none of the 845
exact restrictions in the public files does (eval/pattern-inclusion-2026-11-20.md).

Date, time and duration ranges are graded too (2026-11-20). A range whose
bounds are plain dates (`minInclusive="2024-01-01"`) is read as the exact set
of strings the checker passes on it: an ISO day that exists, in any time zone
Date.parse accepts, whose instant is inside the bounds. So a date range now
compares with a pattern, a list of dates or another range like any string
restriction, with example values: `>= 2024-01-01` to `>= 2024-06-01` asks
more ("e.g. 2024-01-01 matched before, not now"), and `<= 2024-02-29` to
`< 2024-03-01` asks less, because a day written west of UTC
(`2024-02-29-00:01`) is after midnight on the 29th but before 1 March.
dateTime, time and duration ranges, and dates with zoned bounds, compare as
intervals on the instants the checker orders. The checker itself was fixed on
the way: a day the month lacks (`2023-02-29`, `2024-04-31`) used to roll into
the next month, so `2024-04-31` passed `>= 2024-05-01`; it now passes no
range, as XSD says it is not a date, and only XML whitespace is trimmed
around a value. Checked on the 31 distinct temporal ranges in the public and
buildingSMART files: 574 of 574 strings near their bounds read the same by the
language and by the checker, 132 of the 236 same-form pairs that read
"different" now grade asks more or less (the other 104 really overlap only in
part), and 94 of 94 example values hold on the checker; buildingSMART's test
pairs stay 334 of 334 (eval/date-range-revisions-2026-11-20.md).

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

### The check as a report you send back (2026-11-21)

After a check, press *Download report (HTML)* on the page, or run
`node cli.mjs model.ifc spec.ids --html report.html` (`html-report.mjs`). It is
one file with nothing loaded from outside, so it opens offline, survives an
email attachment and prints (every section opens before printing). It holds
the verdict, the model and IDS it came from, a table of every specification
(applicable, pass, fail, pass rate), each specification's failing elements with
GlobalId and the reason, and three tallies the CSV makes a reader build by hand:

- **Where to start:** the requirements that fail most often. On real exports a
  single unmapped parameter usually explains a whole row (112 walls missing
  `Pset_WallCommon.ThermalTransmittance` in the HHS Office architect model).
- **Failures by IFC class:** whose discipline the failures belong to.
- **Elements failing the most specifications:** the worst-modelled elements.

A filter box narrows the element rows by GlobalId, name, class or `#id` (the
report reads fully without it, since mail clients drop scripts). Each
specification writes its first 1,000 failing elements and says how many it left
out; the counts are always exact, and the CSV and JSON hold every row. Checked
on 4 real exports against 65 public IDS files (`eval/html-report-2026-11-21.md`).

### The IDS as a document people read (2026-11-20)

An IDS is XML; the people who deliver what it asks for read requirements as a
contract appendix, usually retyped by hand from the XML, and the retyped copy
drifts from the file the models are checked against. Audit an IDS on the page
and press *Download as a readable document* (`.html`, which prints to PDF, or
`.md`), or run `node cli.mjs --to-doc spec.ids -o spec.html` (`spec-doc.mjs`).
The document has the IDS's info fields, a summary table (what each
specification applies to, how many requirements, which IFC versions) and then
each specification: its description and instructions, "Applies to every
`IfcBeam` that is part of an `IfcBridge`", whether such elements are required,
optional or prohibited in the model, and one sentence per requirement:

- It must have the property `Width` in the set `Qto_WallBaseQuantities`, of
  data type `IFCLENGTHMEASURE`, holding a value that is at least `0.1` and less
  than `0.5` (in metres, as IDS requires, whatever unit the model uses).
- If its attribute `Name` is filled in, it must hold a value that is one of `A` or `B`.
- It must be classified in the system `Uniclass 2015` with a code matching the pattern `Pr_.*`.
- It must be contained in (IfcRelContainedInSpatialStructure) an `IfcBuildingStorey`.

Every name and value is copied exactly as the IDS writes it (class names in
their schema case, `IFCWALL` as `IfcWall`); a repairable ids.xsd fault is
repaired first, so the words match what the checker reads.

Checked (`eval/spec-doc-2026-11-20.md`): on the 144 public and buildingSMART
test IDS files, the 113 IfcTester 0.9.0 opens hold 1,224 specifications and
4,458 facets. Every facet got one sentence of the same kind, in the same
order, with the same cardinality, and the specification's required / optional
/ prohibited agreed in 1,224 of 1,224; each of the 10,892 names and values
IfcTester holds for those facets (enumeration members, patterns, bounds,
lengths, data types) appears in its sentence. A copy with one set name and one
cardinality changed is caught (83 and 11 misses), so the comparison can fail.
The wording was read by eye on the 128 sentence shapes the corpus produces,
not by a BIM manager yet.

### Facet links checked against bSDD (2026-11-19)

An IDS property, classification or material facet may carry a `uri`: the
buildingSMART Data Dictionary (bSDD) entry it asks for. `ids.xsd` does not tie
the link to the facet, so an IDS can name `Width` and link IFC's `Name`, or ask
for an `IFCLABEL` where the dictionary says Boolean; a model authored from the
dictionary then fails for the IDS author's slip. `node cli.mjs --audit spec.ids
--bsdd` (bsdd.mjs) looks every link up in bSDD's public API and reports:

- **errors:** a link bSDD does not have (for an IFC link, the IFC 4.3 entry it
  probably meant is named), a link that is not a property or class, a property
  facet linking a class, a dataType that cannot hold the dictionary's values;
- **warnings:** a baseName other than the linked code or name (naming the
  baseName's own link when the dictionary has one: the uri was pasted from the
  next row), the IFC dictionary naming another IFC type, values outside the
  property's allowed values, a classification value, system or required class
  the bSDD class does not match, an Inactive entry;
- **notes:** a link bSDD writes another way (http, `ifc-4.3`, case), a
  dictionary version that is not the latest, a uri outside bSDD.

On every public IDS file with a bSDD link that GitHub code search finds (58
distinct files, 197 distinct bSDD links), 7 files have a bSDD error and 15 a
warning, each read by hand: links pasted from the wrong row (in a template and
in a translation of buildingSMART's own example), a link to an IFC 2x3
dictionary bSDD never had, case-only name differences, and the Dutch
Omgevingswet sets relating classes to IFC classes their dictionary does not
(`eval/bsdd-links-2026-11-19.md`). It is the one option that goes on the
network: one GET per distinct link to api.bsdd.buildingsmart.org, with the
link as the only thing sent. It is not on the page: bSDD's API sends no CORS
header, so a browser cannot ask it.

### bSDD links written for you (2026-11-19)

Most IDS files carry no bSDD links at all: in 117 public IDS files, 316 of
1,317 requirement property facets have a `uri`. For a standard IFC property
the link needs no lookup, because the IFC 4.3 dictionary codes each template
property by its name. `node cli.mjs --link-bsdd spec.ids -o linked.ids`
(bsdd-suggest.mjs) adds `uri="https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/prop/<Name>"`
to every requirement property facet on a `Pset_` or `Qto_` template property
that has none, lists them on stderr, and changes nothing else in the file.
On the page, auditing an IDS shows the same list with a "Download IDS with
bSDD links" button; it runs offline, so it works where the bSDD check cannot.

On the public corpus it suggests 617 links in 54 files; for the 212 facets
that already link the IFC dictionary it gives the same link 196 times, and
the 2 where it differs are author slips the bSDD check had already found
(`Width` linked to `Name`, `AreaPerOccupant` to `OccupancyNumberPeak`). It
leaves alone facets with no standard set, patterns, misspelt names and
classification or material facets. All 54 outputs are the input plus the
attributes, byte for byte (`eval/bsdd-suggest-2026-11-19.md`).

Looked up in bSDD itself (2026-11-19, `node eval/bsdd-suggest-live.mjs`,
the check `--audit OUT.ids --bsdd` runs): every one of the 617 links
resolves. The first run found 2 that did not, both `Pset_PlateCommon.Reference`:
bSDD's IFC 4.3 dictionary has no `prop/Reference`, although `Reference` is
in 108 template sets. `node eval/bsdd-template-sweep.mjs` then asked bSDD
for all 760 template sets: 3,683 of 3,988 set-property pairs sit in bSDD's
set at exactly the rule's link, and 77 names have no bSDD entry at all
(`Reference`, plus 76 from 35 profile, alignment and resource sets bSDD does
not carry). Those are skipped (`BSDD_UNLINKED`; the sweep fails when that
list goes out of date). The 24 other findings on the
inserted links are the facets' own dataTypes, which the suggester already
names (`eval/bsdd-suggest-live-2026-11-19.md`).

### An IDS from a bSDD class (2026-11-19)

The usual way to write an IDS from a data dictionary is to copy rows by hand:
open the class in bSDD, type each property set, property code and data type
into an editor, then paste the property's link. That is how the slips in the
section above get in. `node cli.mjs --from-bsdd CLASS_URI... -o spec.ids`
(bsdd-spec.mjs) asks bSDD for each class with its property list and writes
one specification per class:

- **applicability:** for an IFC-dictionary class, its IFC entity (IfcWallSHEAR
  is IFCWALL with predefined type SHEAR); for any other dictionary's class,
  the IFC entities bSDD relates it to plus a classification facet (system =
  the dictionary's name, value = the class code), so only objects classified
  that way are checked. The specification is optional: a model need not
  contain the class.
- **requirements:** that classification again with the class's `uri`
  (`ids.xsd` allows a `uri` on requirement facets only), then one property
  facet per class property, with its set, its code as baseName, its bSDD
  `uri`, a dataType, the allowed values (one-of), a fixed value or bounds,
  and `cardinality` required where bSDD says `isRequired`, optional otherwise
  (if the property is there, it must fit). bSDD's pseudo-set `Attributes`
  becomes attribute facets, kept only where the entity has that attribute.
- **dataType:** for a standard `Pset_`/`Qto_` property, the IFC templates'
  type, which is what the audit holds a facet to; otherwise the IFC
  dictionary's own note ("takes 'IfcLabel' as value"), asking bSDD for the
  IFC property's entry when another dictionary reuses an IFC property;
  otherwise bSDD's data type (Boolean, Integer, Real, String, Time as
  IFCBOOLEAN, IFCINTEGER, IFCREAL, IFCLABEL, IFCDATETIME). A Real with a
  unit or a dimension becomes the IFC measure it names (`mm` as
  IFCLENGTHMEASURE, `W/(m²·K)` as IFCTHERMALTRANSMITTANCEMEASURE), with its
  allowed values, fixed value and bounds written in SI, which is how IDS
  compares a measure (a 50 to 400 mm thickness becomes 0.05 to 0.4). See
  "Measure types from bSDD units" below.
- Left out and said on stderr: complex properties (no IDS 1.0 facet reaches
  inside one), Inactive properties, related IFC entities the schema does not
  have. `--sets Pset_DoorCommon,...` keeps only the named sets.

Measured on bSDD itself (`eval/bsdd-spec-2026-11-19.md`): from 185 classes in
the 42 Active, latest-version dictionaries that list properties (IFC 4.3
included), 9,198 requirement facets. 38 of 42 generated files have no audit
error, and the 4 that do repeat their dictionary's own faults (a project set
named `Pset_FM`, a quantity the IFC template lacks, languages as a Boolean's
values). 42 of 42 pass the bSDD link check with no error. Five generator
faults found on the way were fixed, the largest being bSDD's
`"predefinedValue": "None"`, which 165 properties answer and which had been
written as a required value.

The editor now keeps a facet's `uri` when it opens a file. Before, it dropped
every one: 0 of 344 links in 53 public files came back, now 344 of 344
(`eval/editor-uri-roundtrip.txt`). A generated file can therefore be opened,
edited and downloaded with its links intact.

### Measure types from bSDD units (2026-11-19)

bSDD types a length, a pressure or a U-value as plain "Real". Written as
`IFCREAL`, the facet fails every model that stores the value as IFC intends,
as an `IfcLengthMeasure` or `IfcThermalTransmittanceMeasure`, because IDS
compares the value's type exactly. Each class property also carries its
units and often its SI dimension exponents, so `--from-bsdd` now picks the
measure (`bsdd-units.mjs`):

- **The unit table** (`schema/bsdd-units.json`, built by
  `schema/gen-bsdd-units.mjs`) joins bSDD's own unit list
  (`/api/Unit/v1`: 616 codes, 417 linked to QUDT) to QUDT's conversion
  factor, offset, dimension vector and quantity kinds (qudt.org, CC BY 4.0).
  275 codes resolve. One bSDD link is wrong and is relinked: bSDD names `°`
  "grad (angel degree)" and links it to QUDT `GRAD`, the gon (π/200 rad); the
  symbol is the degree's.
- **The measure:** the dimension vector picks the IFC measure (41 measures:
  length to inductance). Where two measures share a dimension, QUDT's kind
  picks, but only when the unit names none of the general kind: `m³` is a
  Volume and a SectionModulus in QUDT and stays IFCVOLUMEMEASURE, `N·m` is
  only a Torque and becomes IFCTORQUEMEASURE.
- **Kept as IFCREAL, said on stderr:** no unit or dimension; a
  dimensionless unit (`%`: IFC's ratio measures take 0.5 for 50 %, and the
  dictionary may mean 50; a `dB` property whose name or physicalQuantity
  does not say sound pressure or sound power level, such as a reduction index
  `R_w`);
  units of different measures; a unit against the property's own stated
  dimension; a unit not in bSDD's list (`kg CO2 eq`, `W/mK`); and a value or
  bound that cannot be put in SI because two units are listed (`mm, m`).
  Integer properties are not touched, and a standard set's template type
  still wins.

Measured on bSDD (`eval/bsdd-units-2026-11-19.md`): of 1,625 Real class
properties outside IFC in 22 dictionaries, 867 get a measure (18
dictionaries), and on the same 188 classes the generated own-set facets typed
as a measure go from 1 to 454, with the audit and the bSDD link check
unchanged (39 of 43 files audit clean, 43 of 43 with no link error). On a
built model (`eval/bsdd-units-model.mjs`), a 200 mm wall stored as
`IfcLengthMeasure` failed the old IFCREAL facet and passes the new one, and a
500 mm wall fails it; IfcTester 0.9.0 gives the same 9 verdicts. The bSDD
link check (`--bsdd`) reads a measure facet's SI values against bSDD's values
in the property's unit (18 false `bsdd-value` warnings on kPa strengths to 0).

**Decibels (2026-11-19).** QUDT's `dB` is both a sound pressure and a sound
power level, so a dB property used to stay IFCREAL, and a model storing
`IfcSoundPressureLevelMeasure` as IFC means failed it. `levelOf` now reads
which from the property: physicalQuantity or the name in words ("sound power
level", Schalldruckpegel, geluidsvermogen, pression acoustique), else the ISO
symbol its code starts with (`L_W`, `LWA`: power, ISO 3740; `LA_Fmax_nT`,
`L'nT,w`, `LAeq`, `Ln,w`: pressure, ISO 16032, 717-2). Reduction indices and
level differences (`R_w`, `DnT,w`, `C_tr`) are in dB but are neither and
stay IFCREAL. On a built wall class (`eval/bsdd-db-model.mjs`,
`eval/bsdd-db-model.txt`) a wall typed as IFC means fails the old file only on
its type and passes the new one; a plain IfcReal now fails; IfcTester 0.9.0
gives the same 6 verdicts. Not yet run over the 262 dB properties in bSDD (the
bSDD API did not answer from this session): `node eval/bsdd-units-corpus.mjs
DIR` on a fresh cache counts them.

### Excel2IDS workbooks in, Excel2IDS workbooks out (2026-11-19)

Many BIM managers already agree requirements in buildingSMART-community's
[Excel2IDS](https://github.com/buildingsmart-community/Excel2IDS) template:
asset categories in columns, one requirement per row, an `X` where a category
needs a requirement. `excel2ids.mjs` reads that workbook as it stands, on the
page (drop it where the IDS goes) or with `node cli.mjs --from-sheet book.xlsx
-o out.ids`, and writes one IDS per purpose (`out_MEP.ids`, `out_STR.ids`;
per phase too with `--by-phase`), each audited like any IDS. No Windows tool,
nothing uploaded. The other way round, which Excel2IDS cannot do, `node
cli.mjs --to-excel2ids spec.ids -o book.xlsx` (or *as an Excel2IDS workbook*
after an audit) lays an IDS out in the template, a requirement shared by
several categories written once, and names every specification the template
cannot hold.

On 64 public IDS files, 309 of 507 specifications fit the template and all
309 come back with the same requirements; 256 of 256 on buildingSMART's test
pairs, with the checker's verdict unchanged on 255 (the one that changes is a
lower-case class name the reader upper-cases on purpose). What does not fit:
`partOf` requirements, a material asked for with no name, ranges and lengths.
The template's own sample, read by its rules, asks every external door to be
an `IFCWALL`; the audit names it. Details, and where this reader differs from
the Excel2IDS tool (booleans written `true`, `REPLACEME` rows keep their value
and URI, no fixed `LOD400` milestone): `eval/excel2ids-2026-11-19.md`.

**Where Excel2IDS's own tool would differ, cell by cell (2026-11-19).** After a
workbook is read, the page lists every cell where the Excel2IDS tool (its
source at `4eb7575`, read, not run) would write a different IDS or stop with
none: a category with no purpose (the tool stops), a toggle typed as the text
`FALSE` (on for the tool), a typed `TRUE` (written `True`, which matches
nothing), a number in the matrix (the tool stops), a `REPLACEME` row that takes
another row's instructions or hands its value to an earlier property facet,
`Prohibited` read as required, a moved layout. The CLI prints the same on
`--from-sheet`. The template's own sample has one: its "External doors"
category asks for `IsExternal` = `True`, so the tool's MEP IDS selects no door.
The rules also caught this venture's own download: 316 of 351 workbooks it
wrote had an empty purpose row the tool cannot read; it now writes `General`
(the tool's default) and 0 of 351 stop. Details: `eval/excel2ids-tool-2026-11-19.md`.

**The tool run itself, side by side (2026-11-19).** The rules above were then
checked by running the tool (imported unchanged, ifctester 0.9.0) on the same
321 workbooks: no stops, `LOD400` in every file, the IFC version and the
sample's `True` as predicted. Two things the source reading missed are now on
the list: an empty version cell comes out as `<version>None</version>` (311
of 321 files), and a carriage return in a cell comes out as the escape
`_x000D_`, because openpyxl does not undo the escape Excel writes. The run
also found a fault here: the reader wrote applicability facets in the
template's column order, which broke ids.xsd on one public set (property
before attribute); every spreadsheet path now writes ids.xsd's order. Details:
`eval/excel2ids-sidebyside-2026-11-19.md`.

### An IDS as a spreadsheet and back (2026-11-19)

Requirements are often agreed in a table first and typed into an IDS by hand.
`sheet.mjs` writes an IDS as one row per facet and reads such a table back
into IDS 1.0, as `.xlsx` or CSV (comma, semicolon or tab). On the page, drop
the spreadsheet where the IDS goes, or audit an IDS and press *Download as a
spreadsheet*; on the command line, `--to-sheet` and `--from-sheet`.

| spec | section | facet | name | ifcVersion | entity | propertySet | property | dataType | value | cardinality |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | specification | | Doors are fire rated | IFC4 | | | | | | required |
| 1 | applicability | entity | | | IFCDOOR | | | | | |
| 1 | requirements | property | | | | Pset_DoorCommon | FireRating | IFCLABEL | one of: EI30 \| EI60 | |

A value cell is the exact value, or a restriction written as clauses joined by
`;`: `one of: A | B`, `pattern: [A-Z]{2}\d+`, `>= 0; < 10` (dates and durations
too), `length: 4`, `min length: 1`, `max length: 12`, `base: integer` when the
base is not the one the bounds imply, `note: ...` for an `xs:annotation`. A
leading backslash keeps a cell literal (`\one of: x`, `\=SUM(A1)`); inside a
clause `;;` is a literal `;` and in a one-of list `||` a literal `|`. Info rows
(`section` info, `facet` title, author, ...) fill `<info>`. The workbook has a
*Read me* sheet with the same rules. A row that cannot become IDS is named by
its row number. IDS 0.9 forms are repaired (`fix.mjs`) before the sheet is made.

Measured (`eval/sheet-roundtrip-2026-11-19.md`): all 334 of buildingSMART's
test IDS files come back with the same content through CSV and `.xlsx`, and
the checker gives the same verdict on each pair, 334 of 334; 62 of 64 public
IDS files on GitHub come back the same as written or as repaired (one uses
`<n>` for `<name>`, one has no `<info>`); a workbook LibreOffice saved reads
back the same as ours, except that CR LF line breaks inside two files'
instructions become LF. Excel turns `1.10` into `1.1` when it opens a CSV, so
prefer `.xlsx`.

**Workbooks Excel saved (2026-11-19).** Excel stores what a person types as
numbers, dates and booleans, so the reader shows each cell as Excel does:
a date cell as ISO 8601 (`2024-01-01`, `15:30:18`, `2024-01-01T18:00:00`, from
the cell's number format, with the 1904 date system), a number to Excel's
15 digits (`0.938271604938272`, not the `0.93827160493827155` Excel saved),
a boolean as IDS writes it (`true`, not `TRUE`, which matches no IfcBoolean),
`_x000D_` escapes decoded. An `.xls` or a password-protected workbook is
named instead of being read as CSV. On 321 workbooks from Apache POI's test
files (282 saved by Excel), 65,537 of 65,548 cells now read as openpyxl
reads them, up from 62,182; the rest are cells where no date exists
(`eval/excel-workbooks-2026-11-19.md`). The downloaded workbook formats every
cell, and the empty cells of each column, as Text, so a value a person types
into it later stays as typed (`42.0`, `true`, `1.10`): retyped through
LibreOffice Calc's input line, 56 of 56 public IDS files and 334 of 334
buildingSMART test files come back the same, from 24 and 288 with the
General format. A CSV opened in a spreadsheet still gets typed, so edit the
`.xlsx`. Our workbook stores a CR inside a cell as `_x000D_`, as Excel does.

### Dropdowns in the downloaded workbook (2026-11-19)

The `.xlsx` the page and `--to-sheet -o spec.xlsx` write now offers each
column's words as an in-cell dropdown (data validation, from a hidden *Lists*
sheet). `section` takes only its four words; `facet`, `cardinality` and
partOf `relation` warn on another word but let you keep it (a `min..max`
cardinality is legal on a specification row); `entity`, `propertySet`,
`dataType` and `ifcVersion` offer the IFC schema's concrete classes, standard
set names and data types for the versions the IDS names, and take anything,
so a restriction such as `one of: IFCWALL | IFCSLAB` still fits. Each column
shows a one-line hint when selected.

Measured (`eval/sheet-dropdowns-2026-11-19.md`): on 476 real and test IDS
files, no `section` or `facet` cell falls outside its list; the only
`relation` outside it is a lone `IFCRELFILLSELEMENT`, which ids.xsd refuses.
LibreOffice Calc's *Mark Invalid Data* circles exactly the cells the script
predicts in 476 of 476 workbooks, and the round trip is unchanged. Not
measured in Microsoft Excel itself.

### Repairing an IDS that validating tools refuse (2026-11-18)

An IDS that breaks `ids.xsd` is refused whole by IfcTester, the
IDS-Audit-tool and other tools that validate first; 12 of 65 public IDS
files do, most of them IDS 0.9 exports. Most of those faults have one right
answer, so `fix.mjs` makes the edit: IDS 0.9's `minOccurs` moved from
`<specification>` to `<applicability>` and turned into `cardinality` on
facets, `<name>` and `datatype` in a property facet renamed `<baseName>` and
`dataType`, `IFC4X3` written `IFC4X3_ADD2`, the schema URL used as namespace
replaced, bare text wrapped in `<simpleValue>`, children put in schema order,
a bare `&` escaped. It edits the file's own text, so comments and layout stay,
and lists each change by line. On the page: audit the IDS, then **Download
repaired IDS**. On the command line: `node cli.mjs --fix spec.ids -o
spec-fixed.ids`.

Checked (`eval/fix-structure-2026-11-18.md`): files with no fault come back
byte for byte (682 of 682); the checker reads the same specifications from
every repaired copy as from its original (217 of 217); 198 of the 217 are
valid against IfcTester's `ids.xsd` afterwards, and structure.mjs agrees with
ids.xsd on all 217. Of the 12 public files, 6 come back valid and 4 keep one
or two faults that need a person (an author that is not an e-mail address, a
classification with no system). Building it found that the reader took three
IDS 0.9 forms as "anything" (a property facet's `<name>`, `datatype`, a value
with no `<simpleValue>`); it now reads them as written, which changes 48
facets in 8 public files and nothing in buildingSMART's suite.

### The editor repairs a file as it opens it (2026-11-18)

**Open an IDS file** in the editor now runs the same repair first
(`repairOnOpen` in `editor.mjs`) and lists each change in the open message.
Before, a facet the editor keeps as written went back out with its fault, and
a pattern such as `^\d{2}\.\d{3}$` kept anchors that XML Schema engines read as
literal `^` and `$`. On 65 public IDS files the editor now writes back 60
files that are valid and carry no pattern finding (was 55); the pattern
findings in what it writes go from 9 to 0, and from 51 to 1 on the 80
IDS-Audit-tool files. Facets editable and what each file asks for are
unchanged apart from the rewritten patterns
(`eval/editor-open-repair-2026-11-18.md`).

### Patterns read the way IfcTester reads them (2026-11-18)

IDS patterns are XML Schema regular expressions, and IfcTester reads them that
way (through elementpath). This checker used to read them as JavaScript
regexes, which part on text people really write: `^IFC.*SYSTEM` matched
IFCPIPESYSTEM here and nothing in IfcTester, where `^` is a plain character;
`(?:0[1-9]|1[0-2])` ran here and stops IfcTester. `xsdregex.mjs` now parses
the XSD grammar and matches with its meaning (`\d` any digit, `\w` the XSD
set, `[a-z-[aeiou]]` subtraction, block names), and the audit says where a
pattern means something else elsewhere: an error for one that is not XSD (the
specification reports INVALID), a warning for anchors, needless escapes like
`\/`, and a bare `\w`, which IfcTester reads more narrowly than XSD. The
repaired-file download rewrites them: `(?:` to `(`, anchors dropped,
`{,3}` to `{0,3}`.

Checked (`eval/xsd-regex-2026-11-18.md`): same valid/invalid verdict as
elementpath on 78 of 78 distinct patterns in the public, IDS-Audit-tool and
buildingSMART files, and the same match answer on every probe for 77 (the
78th is `\w+`, below); on 9,000 random patterns over three seeds, every
disagreement is one of two places elementpath departs from the XSD text (a
bare `\w`, a range like `[\d-z]`). 37 of 65 public IDS files use patterns;
4 have one that reads differently in different tools (`^2[ab]` in two BIM2SIM
files, a DFE file's `(?:` date pattern). buildingSMART's suite stays 334 of
334.

### A bare `\w` or `\s`: pick the meaning, and every checker agrees (2026-11-18)

IfcTester keeps a bare `\w` or `\s` (one outside `[...]`) as Python's own
escape. The IDS standard gives both a different meaning. XSD's `\w` takes
`+`, `€` and `°` but not `_`, so `W_01` fails `\w+` under the standard and
passes in IfcTester. XSD's `\s` is only space, tab and line breaks, so a
no-break space (common in text pasted from Excel or Word) fails `\s`. 4 of
the 65 public IDS files write `-?\d{2}\s.*` for storey names. The audit warns
on both (`pattern-word-class`, `pattern-space-class`). The repair box on the
page then asks which meaning to keep. "As IfcTester reads it" writes
`[\p{L}\p{Nd}_]` and `[\s\p{Z}]`. "As the standard says" writes
`[^\p{P}\p{Z}\p{C}]` and `[\s]`. Either way, every checker reads the file the
same way. The CLI does the same with `node cli.mjs --fix spec.ids --word-class
letters|xsd`. With no choice, nothing is rewritten.

Checked (`eval/word-class-2026-11-18.md`): on 1,500 random patterns and the 2
corpus ones, elementpath reads both spellings as this checker does (1,500 of
1,500 each). The standard's spelling gives IfcTester the standard's answer on
every probe. IfcTester's spelling matches IfcTester's old reading on 1,330.
The other 170 differ only on `²`, `Ⅳ` and the form feed. buildingSMART's 16
`\w+` test pairs score 16 of 16 as written and after either repair.
An ifcXML string holding only spaces now stays as written, as it does in STEP.

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

Since 2026-11-18 (`eval/attribute-any-geometry-2026-11-18.md`) an attribute
facet reads geometry's arguments shallow: each nested list is stepped over
and kept only as "empty" or "not empty", which is all the attribute test asks
of a list. A file whose attribute facets match every name (OpenAEC's NL-BIM
Basis ILS fixture) takes 4.7 s on the HHS MEP export, where it took 10.2 s.
The 68 files take 8.3 s there, where they took 13.3 s, at 646 MB RSS, down from
1,024 MB. On the 219 MB federated model they take 67.5 s, where they took
114.3 s, and they now finish under a 1 GB heap, where main ran out of memory.
Every report is identical.

Since 2026-11-18 (`eval/psets-cache-2026-11-18.md`) the model keeps, per
property set name, the elements that reach a set of that name, so a property
facet on every entity tests each distinct name once, costs one lookup per
element, and reads property sets only where a name matches. The 68 files take
4.6 s on the HHS MEP export, where main took 7.9 s on the same machine, and
39.4 s on the 219 MB federated model, where it took 63.1 s (71.3 s under a
1 GB heap, where it took 105.0 s). Every report is identical.

Since 2026-11-18 (`eval/file-order-candidates-2026-11-18.md`) a
specification with no entity facet no longer walks every entity when one of
its facets names a short list: the index its prefilter reads (property set
holders, classification, material and relationship maps, the classes with a
named attribute) gives the candidates, and they are put back in file order
(an array of positions built once per model, since real exports do not number
their entities in file order). On HHS MEP the 24 public specifications that
take a list go from 896 to 305 ms of `applies`, and on the 219 MB federated
model from 6.1 to 2.2 s (whole run 56.2 to 49.6 s); those that apply to most
of the model still walk. Every report is identical.

Since 2026-11-18 (`eval/applies-cache-2026-11-18.md`) a parsed model keeps
what repeats between specifications and between IDS files: each distinct
applicability's result (a result taking most of the model kept as the
entities it leaves out), and, for a facet run over more than a quarter of the
model, one byte per entity for its verdict (at most 8 facets, the least
recently used dropped). On HHS MEP the 68 files ran 11.4 million facet tests,
7.9 million of them repeats; they now run 3.7 million. The 68 files take
5.0-5.3 s there, where main took 6.3-7.0 s, 2.5 s on Schultz Residence, where
it took 3.4 s, and 43.1 s on the 219 MB federated model, where it took 60.4 s
(55-57 s under a 1 GB heap, where it took 92-100 s; the kept results live
off the JS heap, so the run fits as main's does). Every report is identical, and
`check(..., { facetCache: false })` turns the caches off.

Since 2026-11-18 (`eval/attribute-shape-2026-11-18.md`) attribute facets that
differ only in their value share one reading of each entity: whether the name
takes an attribute, whether it is set, empty, or a list or reference that IDS
cannot compare. The verdict cache keeps that reading in the spare bits of the
bytes it already holds, so it costs no memory. On HHS MEP the 68 files ran
`AttributeFacet.test` 2,851,787 times and now run it 190,924 times, plus one
reading per entity. They take 2.9-3.1 s there (main 4.1-4.5 s), 1.6-1.7 s on
Schultz Residence (2.1-2.3 s), and 28.4-29.6 s on the 219 MB federated model
(35.7-36.7 s), 35.4-36.6 s under a 1 GB heap (49.3-51.5 s). The same run found
that the STEP reader kept every decoded string over 12 characters as a chain
of one-character pieces, about 32 bytes a character (20 MB on HHS MEP). Plain
text is now copied in runs. Every report is identical.

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

7. **ifcXML twins from a real IFC4 exporter** (2026-11-18,
   `eval/ifcxml-twins-2026-11-18.md`). `eval/fetch-ifcxml-twins.sh` fetches
   the 41 IFC4 ADD2 TC1 Annex E examples (each as `.ifc` and `.ifcxml`; the
   STEP files from Geometry Gym's Rhino and Grasshopper plug-ins, Constructivity,
   SDS/2 and a text editor, the ifcXML files all in one writer's layout) and two
   pairs written by GeometryGymIFC; `node eval/ifcxml-twins.mjs` compares each pair as
   graphs (every entity hashed with its references' hashes, since the XML's
   ids do not map to `#N`), by GlobalId attribute by attribute, and by the
   three sample IDS files' verdicts. On the reader before this change 108 of
   129 verdicts matched: all 43 ifcXML files write references as `href="i1"`, and
   each became an empty copy, so `construction-scheduling-task`'s 4 walls read
   as 24 with 20 "has no material". Seven forms are read now (`href`, decimal
   commas in 41 of 43 files, derived attributes given a value, IsTypedBy
   written as the relationship, `<Position>` holding references, flat lists of
   lists, an attribute name in the wrong case): 129 of 129 verdicts match, 12
   pairs are identical graphs and 24 once STEP entities nothing reaches are set
   aside; each remaining difference was traced to the files (values the XML
   writer drops, STEP written to an older IFC4 draft, the two halves of a few
   pairs being different exports). No IFC4X3 ifcXML file was found in public.
   Later the same day the reader cut IfcBSplineSurface control points, written
   flat, into rows from the knot data (sum of U multiplicities minus U degree
   minus 1 rows): `basin-advanced-brep` became an identical graph (17 STEP-only
   entities to 0), 13 pairs identical, 25 once unreachable STEP entities are set
   aside, GlobalId-paired values 5,702 identical and 80 different (was 5,695 and
   87); the cube's 4 surfaces still differ only by `SelfIntersect`, `.U.` in STEP
   and `false` in the XML (`eval/ifcxml-twins-2026-11-18.md`, "B-spline control
   points").

8. **Large ifcXML, read as it streams** (2026-11-18,
   `eval/lazy-ifcxml-2026-11-18.md`). No public ifcXML is over 0.6 MB, so
   `eval/step-to-ifcxml.mjs` writes real STEP exports as ifcXML in xBIM's
   IFC2X3 layout; read back, all entities of the seven HHS Office and Schultz
   exports equal the STEP reading (2,340,831), after one fix the round trip
   found: string values were trimmed, so 731 MEP labels with a leading space
   read differently from ifcXML. The reader now reads each top-level element
   as it closes and drops it, and keeps geometry as a span read again on
   demand. 68 IDS files on HHS MEP as ifcXML (152 MB): 10.3 s and 1,680 MB
   peak to 8.7 s and 681 MB; a 374 MB federated ifcXML: 4.0 GB peak (out of
   memory under a 1 GB heap) to 1.5 GB, and it finishes under 1 GB; every
   report identical.
9. **The nested IFC4 ifcXML layout at scale** (2026-11-18,
   `eval/ifc4-layout-scale-2026-11-18.md`). Real IFC4 writers put 96-99.9% of
   a file under one element (the IfcProject), so reading by top-level element
   held nearly the whole tree. `eval/ifc4-layout.mjs` writes four real IFC4
   and IFC4X3 exports (10-32 MB as STEP) in that layout. They read back entity
   for entity (857,301 of 857,301), and 2,160 of 2,160 verdicts from 68 IDS
   files equal the STEP file's. Two faults fixed. First, the schema was taken
   from any "IFC2x3" in the first 4,000 characters, and ARCHICAD's IFC4 export
   names its "IFC2x3 add-on" there: 19 of 539 verdicts were wrong, with no
   error shown. It is now read from the root element. Second, nested geometry
   is cut to its span as it closes. A 166 MB federated file peaks at
   1,770 MB before and 1,481 MB after, and fits a 768 MB heap, which it did
   not before; reports are identical.
10. **Nested ifcXML read as it closes** (2026-11-18,
   `eval/nested-early-2026-11-18.md`). Property sets, relationships and the
   rest of the model under the root are now read into records as each
   element closes; nothing under the root is kept as XML. Entities still get
   the old parent-first numbers: an early read gives provisional numbers,
   and the walk replays them in the old order. On 57 ifcXML files (864,346
   entities) every number, argument, map position and note equals main's,
   and the reports from 68 IDS files hash the same on five models. The
   smallest heap that parses each single-project model fell from 160 to
   96 MB (C20), 144 to 128 MB and 128 to 112 MB, and stayed at 160 MB on
   FM_ARC_DigitalHub. A six-project federated file is unchanged at 704 MB,
   where the kept records, not the tree, set the peak.
11. **A smaller record per entity** (2026-11-18,
   `eval/entity-table-2026-11-18.md`). A STEP entity's record dropped from
   four fields to three (the argument offset and the read arguments share
   one), and the entities are held by number in a plain array with the file
   order in an `Int32Array`, not in a Map, whose hash table cost about as
   much as the records. Heap kept after parsing: HHS MEP 93 to 65 MB, the
   219 MB federated model 444 to 350 MB. The smallest heap that parses it:
   704 to 576 MB (HHS MEP 144 to 112 MB); with the starter IDS files, 832 to
   704 MB. Parsing is 20-30% faster. Reports from 68 IDS files hash the same
   on four models.
12. **The checks' own memory** (2026-11-18,
   `eval/shared-values-2026-11-18.md`). Most of what 68 IDS files added to
   the heap was arguments kept once read, in lists built by `push` (room for
   16 items for every four). Lists are now copied to their length, repeated
   small values (`IFCBOOLEAN(.T.)`, property names, enumerations) are shared
   frozen objects, and relationships' arguments are not kept once indexed.
   On the 219 MB federated model the smallest heap that parses it fell from
   576 to 512 MB, with the starter IDS from 704 to 576 MB, and with all 68
   IDS files from 896 to 704 MB. Reports hash the same on four models.
13. **Property sets as one record each** (2026-11-18,
   `eval/pset-records-2026-11-18.md`). The first read of a property set keeps
   one flat list (the set's name, then each property's name and entity), and
   the arguments of sets, properties and quantities are no longer kept; a
   value is read from the text when a facet asks for it. What 68 IDS files
   add to the heap of the 219 MB federated model fell from 137 to 71 MB, and
   the smallest heap that parses it and runs all 68 from 704 to 608 MB
   (HHS MEP after the checks: 119 to 107 MB). The checks take about as long
   as before (federated 10.7-11.5 s on main, 11.4 s here). Reports hash the
   same on five models.
14. **STEP read from the file's bytes** (2026-11-18,
   `eval/step-bytes-2026-11-18.md`). `readModel` returns the file's bytes
   and the STEP reader scans them, decoding a record to a short string only
   when its arguments are read, so the file is never one string on the V8
   heap; the page and the editor post bytes to the worker. The smallest heap
   that parses the 219 MB federated model fell from 512 to 304 MB, with the
   starter IDS files from 544 to 352 MB, and with all 68 IDS files from 640
   to 448 MB (HHS MEP parse 112 to 64 MB). A STEP file past V8's
   536,870,888-character string limit, which main could not open, now reads:
   a 670 MB federated model (11.0 million entities) checks against the
   starter IDS in 13.9 s. Checks are about 5% slower (each read decodes its
   record). Reports from 68 IDS files hash the same on four models.
15. **ifcXML read from the file's bytes** (2026-11-18,
   `eval/ifcxml-bytes-2026-11-18.md`). The XML reader runs over the bytes,
   decoding each name, attribute value and text run on its own, and lazy
   geometry is read again from its byte span, so an ifcXML file is no longer
   one string on the heap. The smallest heap that parses HHS MEP as ifcXML
   fell from 336 to 192 MB; the 374 MB federated ifcXML parses in 448 MB
   (was 800) and checks against all 68 IDS files in 448 MB (was 832). A
   680 MB ifcXML, which main refused (string length limit), checks against
   the starter IDS in 25.6 s. Reports from 68 IDS files hash the same on
   three models; times are unchanged within noise.
16. **White space between XML elements skipped** (2026-11-18,
   `eval/xml-whitespace-2026-11-18.md`). Inside an element that has had a
   child element, a text run of only white space is not decoded or kept;
   leaf text, CDATA and character references are kept exactly. On main, the
   `<uos>` element's text grew by one piece per entity until the file ended.
   The XML reader alone now needs 2-4 MB of working heap instead of 40-106 MB
   and is 5-29% faster. The 455 MB indented federated ifcXML parses in 416 MB
   (was 480) and checks against all 68 IDS files in 448 MB (was 512).
   Reports from 68 IDS files hash the same on four models, flat and
   indented.

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

- The readable document (`--to-doc`) says what each facet asks in English
  only, and has not yet been read by the people it is for; a sentence keeps
  every value verbatim, but a long enumeration stays one long sentence.
- `--from-bsdd` writes non-IFC Real properties as IFCREAL (bSDD's units
  are not mapped to measure types yet) and leaves complex properties out;
  like `--bsdd`, it runs from the command line only.
- bSDD links (`--bsdd`) are checked from the command line only (bSDD's API
  allows no browser calls) and not against the property set, which bSDD gives
  only on a class's property list (`eval/bsdd-links-2026-11-19.md`, Limits).

- ifcJSON is read as the two public converters write it (checked on their
  97 twins, not on any authoring tool's own export, as none was found); the
  file is parsed whole, so it must fit in one JavaScript string (about 537
  MB). ifcXML is checked on 9 real documents from about
  seven exporters and 43 IFC4 STEP/ifcXML twins, not on every tool's output,
  and on no real IFC4X3 file (none was found); an IfcBSplineSurface's control
  points written flat are cut into rows from its knot counts, and left flat
  (with a note) when the counts do not multiply out. The ifcXML reader streams
  (2026-11-18, `eval/lazy-ifcxml-2026-11-18.md`): a 374 MB ifcXML checks under a
  1 GB heap, about twice the time of the same model as STEP. Since
  2026-11-18 both forms are read from the file's bytes, so files past a
  JavaScript string's 537 MB limit open (`eval/step-bytes-2026-11-18.md`,
  `eval/ifcxml-bytes-2026-11-18.md`: a 680 MB ifcXML checks in 25.6 s). In the
  nested IFC4 layout every entity is read as its element closes
  (`eval/nested-early-2026-11-18.md`), so the tree under the root is not
  held; a 166 MB federated file still peaks about 1.4x higher than the same
  model as STEP, set by the records kept per entity.
- The model's bytes are held in memory (outside the JavaScript heap since
  2026-11-18, `eval/step-bytes-2026-11-18.md`; ifcXML too,
  `eval/ifcxml-bytes-2026-11-18.md`) with a small record per entity (48
  bytes and 12 more in the number index, since 2026-11-18,
  `eval/entity-table-2026-11-18.md`); an
  entity's arguments are read when a check first needs them, and geometry's
  are not kept (2026-11-17, `eval/heap-200mb-2026-11-17.md`). A 219 MB
  federated model built from seven real exports peaks at about 1 GB with the
  starter IDS files, where reading every argument up front took 2.5 GB, and
  with all 68 public and starter IDS files it finishes under a 1 GB heap
  (since 2026-11-18, when attribute facets began reading geometry's arguments
  with nested lists unread, `eval/attribute-any-geometry-2026-11-18.md`; it
  needed 2 GB before, `eval/no-entity-facet-2026-11-17.md`). Models well past 500 MB may need the command line with
  `--max-old-space-size`. The ifcXML reader reads each element as it streams
  and keeps geometry only as where its text starts and ends.
- The IDS audit checks the file against the IDS 1.0 XML schema (element
  order, allowed attributes, cardinality and other fixed-list values;
  2026-11-18, `structure.mjs`, `eval/ids-structure-2026-11-18.md`: the same
  verdict as IfcTester's `ids.xsd` validation on 145 of 145 public and
  test files and 2,935 of 2,935 mutated copies), but not every rule of the
  imported XMLSchema.xsd inside an `xs:restriction`. Property
  set templates are checked for names, data types, applicable classes and,
  in IFC4 and IFC4X3, the predefined types a set is limited to (since
  2026-11-19), and for where the template type puts a set (occurrences only,
  or a performance history; since 2026-11-19); not in IFC2X3, whose templates
  name classes without types or template types, and not for material and
  profile sets, which are left to the class check.
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
  a real IFC4 export with dates to try the range on;
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
- STEP/ifcXML twins: buildingSMART's IFC4 ADD2 TC1 Annex E examples,
  `github.com/buildingSMART/Standards-builds`, and two from
  `github.com/GeometryGym/GeometryGymIFCExamples` (MIT); fetched by
  `eval/fetch-ifcxml-twins.sh`, not copied here.

IDS is a buildingSMART International standard. This tool is independent and
not endorsed by buildingSMART.

## Disclaimer

Provided free and as-is, without warranty of any kind. A passing check means
the model meets the IDS as this software reads it. It is not a design review,
a code-compliance check or professional advice, and it does not replace the
judgment of the architect, engineer or BIM manager responsible for the model.

## License

MIT, see `LICENSE`.
