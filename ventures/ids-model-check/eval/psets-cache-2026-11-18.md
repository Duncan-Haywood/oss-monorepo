# Property facets on every entity: sets indexed by name (2026-11-18)

`eval/attribute-any-geometry-2026-11-18.md` left the HHS MEP profile led by
`psetsOf`'s `add` (15%) and the property prefilter (11%): the property-set
specifications that apply to every entity. Measured again on the same 68 IDS
files before this change, `add` was 13.3% of self time, the prefilter's
closure 10.7%, `AttributeFacet.test` 10.6% and `Schema.isA` 4.9%.

## Why property sets were read so often

- The property prefilter said yes to every element with any property set,
  whatever the set's name. It also cost three map lookups and a type test on
  every entity in the pool (665,224 on HHS MEP when a specification has no
  entity facet, or an entity name pattern that takes any class).
- So `psetsOf(model, e)` ran on every such element for every property
  facet. It read each of the element's sets (name, property list, each
  property's name) and built new maps, even where no set had the name the
  facet asks for. Each read also kept the set's and properties' arguments in
  memory.
- `AttributeFacet.test` matched the facet's name against the class's
  attribute list for every entity and allocated two arrays each time, though
  the answer depends only on the class.
- `Schema.isA` built a `type + ">" + ancestor` string for its cache key on
  every call.

## What changed (`ids.mjs`)

- `psetSources(model, e, visit)`: the sets `psetsOf` reads, in its order
  (the type's, a type object's own, the property relationships', a
  material's). `psetsOf` and the new index share it, so they cannot drift.
- `psetHolders(model)`: for each set name, the elements that reach a set of
  that name, built once per model. It reads only each set's `Name` (118
  distinct names, 192,355 element-to-set links on the 219 MB federated model).
- The property prefilter is exact for the facet's `propertySet`: it tests
  each distinct set name once, collects the elements under the names it
  takes, and answers with one set lookup. Where it says no,
  `PropertyFacet.test` would have said "has no property set" (absent), so the
  requirement's verdict follows from its cardinality and nothing is read, as
  before. `psetsOf` now runs only on elements that hold a set of a name the
  facet takes.
- `AttributeFacet.test` keeps the matching attributes per class.
- `Schema.isA` caches by type, then ancestor.

### A cache that did not fit

A first version also cached every set's name and properties on the model
(`psetInfo`, with `psetsOf` handing back the cached map and copying it on an
override). It was 5.6 s on HHS MEP, but on the federated model under a
1 GB heap it ran out of memory where main finished. Main's run ends with
1,022 MB live after a forced collection (measured after each IDS file with
`--expose-gc`), so it only just fits. The cache read every reachable set up
front and kept 117,279 sets' and 418,653 properties' arguments from the first
file on, and their maps added about 10 MB more. Without the cache, only the
names are read up front, and properties are read only where a facet's set
name matches. The run ends with 991 MB live, 31 MB under main, and HHS MEP
takes 4.6 s. `psetInfo` stays as an uncached helper.

## Results

Same method as `eval/attribute-any-geometry-2026-11-18.md`: reports
SHA-256 hashed with `seconds` removed (`eval/heap-compare.mjs`,
`maxFailed: 1000`), the 3 starter and 65 public IDS files from
`eval/fetch-audit-corpus.sh` (one public file is not a readable IDS and fails
the same way on both sides), models from `opensourceBIM/IFC-files` at
`cb96c50`, each parsed once. "main" is `origin/main` at `aebd459df`, unpacked
with `git archive`. Node 22, 4 vCPU, the runs one after another in one batch.

| model | main | this change | reports |
|---|---|---|---|
| HHS MEP 39.6 MB | 7.9 s, 644 MB RSS | 4.6 s, 626 MB | identical |
| HHS architect 13.1 MB | 3.2 s, 284 MB | 2.3 s, 288 MB | identical |
| HHS construction 3.9 MB | 1.1 s, 183 MB | 0.9 s, 178 MB | identical |
| Schultz Residence 22.5 MB | 3.2 s, 302 MB | 2.6 s, 304 MB | identical |
| federated 219 MB, `--max-old-space-size=2048` | 63.1 s, 1,838 MB | 39.4 s, 1,825 MB | identical |
| federated 219 MB, `--max-old-space-size=1024` | 105.0 s, 1,272 MB | 71.3 s, 1,228 MB | identical |

The federated model is `eval/federate.mjs` over the nine exports listed in
`eval/heap-200mb-2026-11-17.md`. Main's times are lower here than in the
previous note (HHS MEP 7.9 s against 8.3 s, federated 63.1 s against
67.5 s): the container differs, so compare rows of one table, not across
notes. Earlier single runs of main on HHS MEP in this session took 9.0 and
9.6 s, so expect about 10% run-to-run spread.

Steps on HHS MEP, one run each: 9.6 s on main; 22.4 s with a prefilter that
rescanned every holder for each facet (the scan has to be once per model);
8.8 s with the holders built once but per set (23,456 sets on HHS MEP, each
name tested per facet); 5.9 s grouped by name; 5.5 s with the two-level
`isA` cache; 4.9 s with the per-set cache removed (the same run's
predecessor measured 5.5 s).

Profiled after the change, HHS MEP's 68-file run is led by the garbage
collector (14%), `AttributeFacet.test` (13%, the OpenAEC fixture's any-name
attribute facets on all 665,224 entities) and `applies`' loop over every
entity (9%). The property path no longer appears in the top ten.

## Checks

- `node --test *.test.mjs`: 195 tests, 193 pass, 2 skipped (the two that
  need fetched corpora).
- New `psets-cache.test.mjs`, on a model with a door type's set inherited by
  three doors (one reached only through its type), one door overriding a
  property by an occurrence set of the same name, a set with no name, a
  custom set, a material's properties, a wall with no sets and a point:
  - `psetsOf` equals main's reader (kept in the test) on every entity, and
    the override does not change what the type's other doors read;
  - `psetHolders` names exactly the entities main's reader gives a set of
    each name;
  - 21 specifications (property requirements under six set names, exact and
    patterned, in each cardinality, on every entity; property applicability
    under three names) give the applicable count, pass count and failing
    elements of every entity run through the facets' own tests.
  - Two planted faults each fail it: the holder index leaving out elements
    reached only through their type, and leaving out materials' properties.
- The reports on all five models hash the same as main's.

## What is left

- `applies` still walks every entity for a specification with no entity
  facet. Each step is now one lookup, but a candidate list in file order (an
  ordinal per entity) would skip the walk.
- At 1 GB the federated run is still close to the limit: 991 MB live at the
  end. The kept arguments of non-geometry entities are most of it.
- The ifcXML reader still builds every entity up front.
