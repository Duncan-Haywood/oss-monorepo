# Specifications that apply to every entity: 68 public IDS files, 7x faster (2026-11-17)

`eval/heap-200mb-2026-11-17.md` left one gap: public IDS files whose
specifications have no entity facet apply to every entity, so on the 219 MB
federated model (3.7 million entities, three quarters of them geometry) the
68-file run took 501 s and peaked at 4.7 GB. This run finds where the time
went and removes it without changing any report, and finds that the 4.7 GB was
never live data.

## What the public files ask

Of the 65 public IDS files `eval/fetch-audit-corpus.sh` fetches, 26
specifications have no entity facet in their applicability:

| applicability | specifications |
|---|---:|
| `attribute GlobalId` | 8 |
| `property Pset_WallCommon` (one or two facets) | 10 |
| `property` on another set (DPP_Reference, Pset_SolidStratumCapacity, curtain wall, window, door) | 5 |
| `attribute` with a pattern name matching anything | 2 |
| nothing at all | 1 |

A further group writes an entity facet whose name is a pattern matching every
class (`entity (any)`): one file (OpenAEC's NL-BIM Basis ILS fixture) has eight
such specifications, CedricDriesen92's rulebook output three, each checking
property and attribute requirements on all 665,224 entities of the HHS MEP
export.

## Where the time went

`--cpu-prof` on the HHS MEP export with the OpenAEC fixture (44 s of main's
96 s for 68 files):

- 54% in `EntityFacet.names`: on an IFC2X3 model it walks the type mapping
  table with `Object.entries(typeMap)` for every entity and every test, a new
  array of a few hundred pairs each time. Most specifications pay it once per
  candidate; one that applies to every entity pays it millions of times.
- Most of the rest was parsing geometry arguments for requirements such as
  "required property Pset_WallCommon.LoadBearing" on 500,000 Cartesian points
  that have no property set, and building failure text for elements past the
  1,000 the report keeps.

## What changed (`ids.mjs`)

1. **An argument-free prefilter per facet.** For each facet kind, a test that
   reads only the entity's type or the relationship indexes the model already
   builds, and is false only where the facet's own test fails as absent:
   attribute (the class has an attribute by that name), property (the element
   has a type, a property relationship or material properties, or is a type
   object), classification (own or external reference, or a type), material
   (own association or a type), partOf (the first step of the chosen
   relationships). Applicability runs it before the full tests, in model
   order, so the same elements come out in the same order.
2. **Requirements judged before reasons are written.** Where a requirement
   facet's prefilter is false the facet is absent, so the verdict follows from
   the cardinality (required fails; optional and prohibited pass). Each element
   is first judged that way, stopping at the first unmet requirement; the full
   tests, with their failure text, run only for a failing element the report
   keeps. A wrong "fails" from the shortcut cannot change a report, since the
   full tests then decide; a wrong "passes" could, and the test below checks it
   against brute force.
3. **The IFC2X3 type mapping table indexed once** by occurrence class (a
   `WeakMap` keyed by the table), rows in the table's order.

## Results

Reports are SHA-256 hashed with `seconds` removed (`eval/heap-compare.mjs`,
`maxFailed: 1000`), 68 IDS files (the three starter files and the 65 public
ones; one public file is not a readable IDS and fails the same way on both
sides). "main" is `origin/main` at `d67997484` (lazy STEP arguments already
in), unpacked with `git archive`. Node 22, 4 vCPU, 16 GB; each model parsed
once.

| model | main | this branch | reports |
|---|---|---|---|
| HHS MEP 39.6 MB | 96.2 s, 1,105 MB RSS | 13.3 s, 1,018 MB | identical |
| HHS architect 13.1 MB | 22.5 s, 479 MB | 5.1 s, 467 MB | identical |
| HHS construction 3.9 MB | 6.9 s, 287 MB | 1.3 s, 233 MB | identical |
| Schultz Residence 22.5 MB | 46.7 s, 554 MB | 8.1 s, 524 MB | identical |
| federated 219 MB, 12 GB heap allowed | 514.9 s, 4,743 MB | 110.7 s (default heap), 4,577 MB | identical |
| federated 219 MB, `--max-old-space-size=2048` | 476.0 s, 2,027 MB | 138.5 s, 2,055 MB | identical |
| federated 219 MB, `--max-old-space-size=1024` | | out of memory | |

The steps one at a time on HHS MEP (68 files): prefilters only 67.7 s; with
the requirement shortcut 52.2 s; with the type map index 13.3 s. On the
federated model: 439.1 s, 299.8 s, then 110.7 s.

The 4.6 GB peak with no cap is garbage V8 has not yet collected, not live
data, and that was already true on main: `eval/heap-per-ids.mjs` (each IDS
checked, then a full GC) shows the whole 68-file run on the federated model
retaining about 300 MB beyond the parsed model (708 MB), and with a 2 GB cap
main and this branch both finish with the same reports (main in 476 s, this
branch in 139 s). Node's default heap limit on this 16 GB machine is 8.6 GB,
so the uncapped run collects late. `eval/heap-200mb-2026-11-17.md` read the
uncapped peak as the memory the run needs; it is not. This change is a time
saving, not a memory one. On the HHS MEP export the OpenAEC fixture goes from 44.1 s to 13.5 s
and CedricDriesen92's rulebook file from 18.1 s to 0.7 s.

## Checks

- `node --test *.test.mjs`: 122 tests, 121 pass, 1 skipped (as on main). The
  new test in `engine.test.mjs` takes 13 facets (attribute by name and by
  pattern, property by set, set and name, and patterns; classification;
  material; partOf with no relation, containment, aggregation and the
  voids/fills pair) on the sample model and on a wall whose set, material and
  classification all come through its type: as applicability with no entity
  facet, the applicable count and the listed elements equal a brute-force run
  of the full tests over every entity; as a requirement on every entity in each
  of the three cardinalities (78 cases), passed, failed and the listed elements
  equal brute force, with `maxFailed` unlimited and 3. Removing the type or
  material-properties source from a prefilter, or dropping the overflow count,
  fails it.
- buildingSMART's test pairs (`eval/run-testcases.mjs`): 334 of 334, strict
  333 of 334, as before.

## What is left

- The OpenAEC fixture's attribute requirements with a pattern name
  (`attribute (any) = "?"`) need every entity's values, so geometry is still
  parsed for them: most of its 13.5 s on HHS MEP.
- With a 1 GB heap the 68-file federated run still runs out of memory; the
  starter files fit in 1 GB (`eval/heap-200mb-2026-11-17.md`).
- The ifcXML reader still builds every entity up front.
