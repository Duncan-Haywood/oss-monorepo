# Property sets read once per model (2026-11-18)

`eval/attribute-any-geometry-2026-11-18.md` left the HHS MEP profile led by
`psetsOf`'s `add` (15%) and the property prefilter (11%): the property-set
specifications that apply to every entity. Measured again on the same 68 IDS
files before this change, `add` was 13.3% of self time, the prefilter's
closure 10.7%, `AttributeFacet.test` 10.6% and `Schema.isA` 4.9%.

## Why property sets were read so often

- `psetsOf(model, e)` read each set's `Name` and walked its `HasProperties`
  every time an element was tested. A type's sets reach every occurrence of
  that type, and the 539 specifications in the 68 files test the same
  elements again and again, so one set was read hundreds of times.
- The property prefilter ran three map lookups and a type test on every
  entity in the pool (665,224 on HHS MEP when a specification has no entity
  facet, or an entity name pattern that takes any class), and it said yes to
  every element with any property set, so `psetsOf` still ran on elements
  whose sets all had other names.
- `AttributeFacet.test` matched the facet's name against the class's
  attribute list for every entity, allocating two arrays each time, though
  the answer depends only on the class.
- `Schema.isA` built a `type + ">" + ancestor` string for its cache key on
  every call.

## What changed (`ids.mjs`)

- `psetInfo(model, pset)`: a set's name and properties, read once per model
  and cached on it. `psetsOf` hands back that cached `props` map when a name
  is held by one set (callers only read it) and copies it when a second set
  of the same name overrides some properties, so an occurrence's override
  never writes into its type's set.
- `psetSources(model, e, visit)`: the sets `psetsOf` reads, in its order.
  `psetsOf` and the new index share it, so they cannot drift apart.
- `psetHolders(model)`: for each set name, the elements that reach a set of
  that name, built once per model from the relationship indexes (23,456 sets
  and 34,918 element-to-set links on HHS MEP).
- The property prefilter is now exact for the facet's `propertySet`: it
  collects the elements under the names the facet takes and answers with one
  set lookup. Where it says no, `PropertyFacet.test` would have said "has no
  property set" (absent), so the requirement verdict follows from the
  cardinality without reading anything, as before.
- `AttributeFacet.test` keeps the matching attributes per class.
- `Schema.isA` caches by type, then ancestor.

## Results

Same method as `eval/attribute-any-geometry-2026-11-18.md`: reports
SHA-256 hashed with `seconds` removed (`eval/heap-compare.mjs`,
`maxFailed: 1000`), the 3 starter and 65 public IDS files from
`eval/fetch-audit-corpus.sh` (one public file is not a readable IDS and fails
the same way on both sides), models from `opensourceBIM/IFC-files` at
`cb96c50`, each parsed once. "main" is `origin/main` at `aebd459df`, unpacked
with `git archive`. Node 22, 4 vCPU, the runs one after another.

| model | main | this change | reports |
|---|---|---|---|
| HHS MEP 39.6 MB | 9.0 s, 648 MB RSS | 5.6 s, 663 MB | identical |
| HHS architect 13.1 MB | 3.5 s, 286 MB | 2.2 s, 289 MB | identical |
| HHS construction 3.9 MB | 1.2 s, 186 MB | 0.8 s, 183 MB | identical |
| Schultz Residence 22.5 MB | 3.3 s, 303 MB | 2.8 s, 303 MB | identical |
FEDROWS

The federated model is `eval/federate.mjs` over the nine exports listed in
`eval/heap-200mb-2026-11-17.md`. Main's HHS MEP time is 9.0 s here against
8.3 s in the previous note's run: the container differs, so compare rows of
one table, not across notes.

On HHS MEP the steps landed in this order (one run each, 68 files):
9.6 s on main; 8.8 s with the cached sets and a prefilter that walked each
set's holders per facet; 5.9 s with the holders grouped by set name, so a
facet tests each distinct name once rather than each of 23,456 sets; 5.5 s
with the two-level `isA` cache. (A first version that rebuilt the holder list
for every facet took 22.4 s: the scan has to be once per model.)

Profiled after the change, HHS MEP's 68-file run is led by the garbage
collector (14%), `AttributeFacet.test` (13%, the OpenAEC fixture's
any-name attribute facets on all 665,224 entities) and `applies`' loop over
every entity (9%). `psetInfo` is under 1%.

## Checks

- `node --test *.test.mjs`: 195 tests, 193 pass, 2 skipped (the two that
  need fetched corpora).
- New `psets-cache.test.mjs`, on a model with a door type's set inherited by
  three doors, one door overriding a property by an occurrence set of the
  same name, a set with no name, a custom set, a material's properties, a
  wall with no sets and a point:
  - `psetsOf` equals the uncached reader (kept in the test, as on main) on
    every entity, and the type's cached set still holds its own value after
    the override was read;
  - `psetHolders` names exactly the entities the uncached reader gives a set
    of each name;
  - 21 specifications (property requirements under six set names, exact and
    patterned, in each cardinality, on every entity; property applicability
    under three names) give the applicable count, pass count and failing
    elements of every entity run through the facets' own tests.
  - Two planted faults each fail it: an override sharing the type's map
    instead of copying it, and the holder index leaving out elements reached
    only through their type.
- The reports on the four models (and the federated one) hash the same as
  main's.

## What is left

- `applies` still walks every entity for a specification with no entity
  facet; the prefilters make each step one lookup, but a candidate list in
  file order (an index per entity) would skip the walk.
- The ifcXML reader still builds every entity up front.
