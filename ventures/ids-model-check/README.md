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
  and buildingSMART's suite (multiple `xs:pattern`s; below).
- IFC2X3, IFC4 and IFC4X3 (ADD2); all six facets (entity, attribute, property,
  classification, material, part of); value restrictions (enumeration, pattern,
  bounds, length); IDS float tolerance; unit conversion to SI from the project's
  units; IFC2X3 occurrence classes through buildingSMART's type mapping table.
- Exports: BCF 2.1 (one topic per failing element, selected by IfcGuid), CSV,
  JSON.
- 22 MB Revit export (Schultz Residence, 424,819 entities): 1.4 s on the command
  line.

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

Browser: open `index.html` through any static server (`npx serve .` or
`python3 -m http.server`), drop a model and an IDS. The page loads only its own
`schema/*.json` tables.

Command line (Node 20+):

```
node cli.mjs model.ifc spec.ids                 # text report, exit 1 on a fail
node cli.mjs model.ifc spec.ids --json          # full report
node cli.mjs model.ifc spec.ids --bcf out.bcfzip --max-failures 20
```

Library: `import { check } from "./node.mjs"; check(idsText, ifcText)` in Node,
or `checkIds(idsText, ifcText, { schemas, typeMap, measureUnits })` from
`ids.mjs` anywhere.

Two starter IDS files written for this tool are in `samples/`:
`coordination-basics.ids` (external/load-bearing walls, wall materials, named
doors and windows on a storey, named spaces, no proxies) and
`quantities-and-naming.ids` (door heights in metres, wall length quantities,
naming patterns, storeys in a building, classification, slab types, fire-rating
format). `samples/tiny-house.ifc` is a hand-written IFC4 model with deliberate
gaps for both.

No API key, account or server is involved, so there is nothing to configure.

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
   and `samples/tiny-house.ifc`. With `samples/coordination-basics.ids`: all
   42 specification results identical. With `samples/quantities-and-naming.ids`:
   identical except the naming-pattern specification, which has two
   `xs:pattern`s. XSD (Part 2, 4.3.4) says several patterns in one restriction
   are alternatives, and buildingSMART's `regex_patterns_work_in_OR` cases
   expect that; IfcTester 0.9.0.post1 requires all of them to match, so it
   fails every wall there and this checker does not.

3. **Unit tests** (`node --test`): STEP and XML readers, tolerance, patterns,
   unit conversion, type inheritance and overrides, cardinality, the sample
   model's known gaps, CSV formula neutralising, and BCF zip structure (and an
   `unzip` round trip when it is installed). The suite test runs when
   `eval/IDS` has been fetched.

Speed (one core, Node 22): Schultz Residence 1.4 s for seven specifications;
IfcTester (C++ parser) took 0.6-0.7 s for the same work. This tool is not
faster than IfcTester; its point is needing no install.

## Model notes and choices

- **Entity facet:** exact class, no subclasses; the predefined type is read from
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
  aggregation (space, storey, building, site).
- **ifcVersion** on a specification is metadata: the check runs anyway and the
  report warns.

## Limitations

- STEP `.ifc` only; ifcXML, ifcJSON and `.ifczip` are not read.
- The whole model is held in memory as text and objects: about 1 GB of heap for
  a 200 MB model. Very large federated models may need the command line with
  `--max-old-space-size`.
- No IDS audit yet: an IDS that is not valid (a facet that the schema forbids,
  a class name that does not exist in the model's schema) is checked as
  written, and its specifications usually fail rather than being reported as
  invalid.
- Tested on five real models; every BIM authoring tool writes IFC a little
  differently, so check surprising results and report them.

## Next steps

- An IDS audit pass (class names and attribute names against the schema,
  value-without-dataType, prohibited specifications with requirements) so an
  invalid IDS is reported as invalid.
- `.ifczip` and ifcXML input.
- More real models through the IfcTester cross-check (an MEP model, an IFC4X3
  infrastructure model).
- An IDS editor page (build a specification from the classes and property sets
  the loaded model actually has).
- A GitHub Action wrapper for checking models on every commit.

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
- IfcTester: IfcOpenShell project, `pypi.org/project/ifctester`.

IDS is a buildingSMART International standard. This tool is independent and
not endorsed by buildingSMART.

## Disclaimer

Provided free and as-is, without warranty of any kind. A passing check means
the model meets the IDS as this software reads it. It is not a design review,
a code-compliance check or professional advice, and it does not replace the
judgment of the architect, engineer or BIM manager responsible for the model.

## License

MIT, see `LICENSE`.
