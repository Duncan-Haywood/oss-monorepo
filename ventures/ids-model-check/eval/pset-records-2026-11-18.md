# Property sets as one compact record each (2026-11-18)

`eval/shared-values-2026-11-18.md` left this open: "Property and quantity
arguments are still kept ... not keeping them cost 17-39% in time. A compact
per-property-set record (names and values, no argument lists) read once might
keep the speed at a fraction of the memory." This run built it.

## Why not keeping them was slow

`psetsOf` rebuilt each of an element's sets from the entities every time a
property facet tested the element: the set's `Name`, its property list, and
each property's `Name`. With the arguments kept, that was a few array reads.
Without them, every read parsed the set's and each property's text again, for
every element and every facet that reached the set.

## What changed (`ids.mjs`)

- `psetRecord(model, set)`: the first read of a set keeps one flat list,
  `[setName, name1, property1, name2, property2, ...]`, copied to its length,
  in a per-model map by set number. The properties are the entities
  themselves (8 bytes each), not `{ref: n}` objects in an argument list.
  `psetInfo` builds its Map from the record (a new one each call, since
  `psetsOf` changes it); `psetHolders` reads a set's name from its record when
  there is one, and otherwise reads the name alone, so properties are still
  read only for sets whose name a facet takes.
- The Model's keep policy now also drops the arguments of property sets,
  properties and quantities once read (`IfcPropertyAbstraction`,
  `IfcProperty`, `IfcPhysicalQuantity`, `IfcPropertySetDefinition`,
  `IfcMaterialProperties`, `IfcProfileProperties` and their subtypes; names a
  schema lacks match nothing).
- `PropertyFacet.values` reads a property's arguments once per call, not once
  per attribute (a bounded value read up to four).

A property's value is read from the text again each time a facet asks for
it. Only properties whose set and property name a facet takes get that far.

## Same reports

`eval/heap-compare.mjs`, 3 starter + 65 public IDS (`eval/fetch-audit-corpus.sh`,
fetched today), `maxFailed: 1000`, every report hashed with `seconds`
removed. Main is `origin/main` at `a8e388b12` unpacked with `git archive`.
Models from `opensourceBIM/IFC-files` at `cb96c50`; the federated model built
as in `heap-200mb-2026-11-17.md` (219,033,563 bytes, 3,671,279 entities).
Node 22.23.5, 4 vCPU.

| model | report hash, main | this change |
|---|---|---|
| HHS MEP, 40 MB | ac315de1a074f017 | ac315de1a074f017 |
| Schultz Residence | a4ea1ee176b8d316 | a4ea1ee176b8d316 |
| HHS architect | 751a0fbc94b92610 | 751a0fbc94b92610 |
| HHS construction | 3c3c585f702d170b | 3c3c585f702d170b |
| federated, 219 MB | 7fb3de2141505b23 | 7fb3de2141505b23 |

(The hashes differ from `shared-values-2026-11-18.md`'s: the public IDS files
are fetched at each repository's HEAD.) The IDS editor's model inventory
(`inventory.mjs`, which reads every property's value and type) hashes the same
on HHS MEP on both sides, 0.40-0.45 s on main and 0.52-0.58 s here.

## Memory

`eval/checks-heap.mjs` (new): parse, force a collection, check the 68 files,
force a collection; the heap includes the model's text. Three runs each,
identical to the megabyte.

| | main | this change |
|---|---:|---:|
| federated 219 MB, heap after parse | 497 MB | 497 MB |
| federated, heap after the 68 checks | 634 MB | **568 MB** |
| HHS MEP, heap after the 68 checks | 119 MB | **107 MB** |
| federated, smallest heap for parse + 68 IDS (`eval/min-heap.sh`, `eval/checks-only.mjs`, 32 MB steps) | 704 MB | **608 MB** |

What the 68 checks add to the federated model's heap fell from 137 to 71 MB.
Of what is left, the records are 12 MB (49,795 sets, 148,821 properties;
measured by dropping the map after the run), and arguments still kept are
28 MB (shape representations, placements, the elements themselves).

The browser page (`eval/heap-page-run.mjs`, the starter IDS, Chromium's V8
heap capped) finishes the federated model under a 512 MB and a 448 MB cap on
both sides, with the same result; single runs, 3.1-3.4 s on main and
3.6-3.7 s here.

## Time

`checkS` from `eval/checks-heap.mjs` (the 68 checks only), three runs each:

| model | main | this change |
|---|---|---|
| HHS MEP | 2.0, 2.1, 2.2 s | 2.2, 2.2, 2.4 s |
| federated 219 MB | 10.7, 11.1, 11.5 s | 11.4, 11.4, 11.4 s |

Where dropping the property arguments alone cost 17-39%, the record keeps the
time within about 10% of main on HHS MEP and within run-to-run noise on the
federated model.

## Checks

- `node --test pset-records.test.mjs` (3 tests): a set's record (name, then
  each named property in order; a set with no name; a quantity set), read once
  per model; `psetInfo` hands out a new Map and a later property of the same
  name wins; a bounded value with its own unit (kN) and a quantity in the
  project's millimetres read the same twice; sets and properties not kept
  after a check, the wall kept; reports equal to the same model with every
  argument read and kept, on an inline model and on tiny-house with the three
  starter IDS.
- Planted faults, each run against `pset-records.test.mjs`,
  `psets-cache.test.mjs`, `engine.test.mjs`, `shared-values.test.mjs` and
  `inventory.test.mjs`:

  | planted fault | tests failed |
  |---|---|
  | the first property of a name wins, not the last | 3 |
  | one shared Map handed out per set (psetsOf's overrides leak into it) | 2 |
  | properties kept | 2 |
  | an unnamed property kept under a made-up name | 2 |
  | a property's own unit ignored | 3 |
- `node --test '*.test.mjs'`: 227 pass, 2 skipped.

## What is left

- With 68 IDS files the federated model's peak is now parse-bound: parsing
  alone needs 512 MB, and the checks add 96 MB to that. The parse's own
  structures (`eval/entity-table-2026-11-18.md`) are the next place to look.
- The editor's inventory reads every property's value and type; it is about
  0.1 s slower on HHS MEP. If it matters on larger models, the inventory could
  read each property's arguments once and pass them to `propertyDataType` and
  the value reader.
