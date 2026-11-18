# Specifications that apply to most of a model: a facet-result cache (2026-11-18)

`eval/file-order-candidates-2026-11-18.md` left this open: the 13
specifications in the 68 public and starter IDS files that apply to most of
HHS MEP (8,647,906 applicable elements between them) cost 1.9 s of
`applies`, because "the facets' own tests on every element are the cost, not
the walk". This run asks how many of those tests are repeats, and keeps the
results that repeat.

## How many tests repeat

Every facet's `test` wrapped with a counter keyed on the facet's content
(cardinality left out, since the test does not read it), the 68 files checked
one after another against one parsed HHS MEP export (665,224 entities), as CI
does (`maxFailed: 1000`). On main (`bed94d087`):

- 11,378,962 facet tests, **7,867,322 of them repeats** of a test already run
  on the same entity with the same facet; 168 distinct facets.
- 539 specifications have 153 distinct applicability sections. The costliest
  repeat is `entity (any)` (an entity facet whose name pattern takes every
  class): 10 specifications in 2 files (OpenAEC's NL-BIM Basis ILS fixture and
  one of CedricDriesen92's rulebook outputs), each testing all 665,224
  entities. `attribute (any)` is the applicability of 2 more, and
  `attribute "GlobalId"` of 8 in 5 files.
- On the requirement side, one facet leads: `attribute (any)` with no value
  (the element has some attribute set). The fixture uses it as the
  applicability of two specifications, and writes it twice as a requirement of
  a third (both on every entity). That facet alone was tested 2.0 million
  times on 665,224 entities.

## What changed (`ids.mjs`)

- **Applicability results, per model** (`applies`). Keyed on the facets' full
  content (`facetsKey`: each facet's own fields as JSON, without the caches a
  facet keeps on itself or the regexes compiled from its patterns, which are
  in the key as patterns). Held off the JS heap, in `Int32Array`s: a result in
  file order that takes more than half the model as the file positions of the
  entities it leaves out (`entity (any)`: none; `attribute (any)`: 3), rebuilt
  by one walk; any other (an entity facet's pool is in class order, not file
  order) as its entities' ids, looked up again in the entities Map. The cache
  holds at most one model's entity count of entries in all (15 MB on the
  219 MB federated model), whatever the number of IDS files.
- **Facet verdicts, per model** (`verdictSlot`, `verdict`). A facet run over a
  pool of more than a quarter of the model keeps each entity's verdict in one
  byte by file position (`fileOrder`): not yet tested, OK, ABSENT (failed with
  `absent: true`), FAIL. The applicability filter and the requirement loop's
  first pass (`meets`) read it; `passFromVerdict` gives `checkRequirement`'s
  pass from it for each cardinality. The reasons for a kept failure are still
  written by the full test, so a verdict that wrongly says "fails" is
  corrected there and only one that wrongly says "passes" could change a
  report. At most 8 facets are kept (665 KB each on HHS MEP, 3.7 MB on the
  federated model), the least recently used dropped first.
- Both caches are per model and per check context: a new `typeMap` (IFC2X3
  entity names) or `measureUnits` object starts a new one.
  `check(..., { facetCache: false })` turns both off.

After the change the same count gives 3,650,434 facet tests on HHS MEP, of
which 138,794 are repeats (most of them the second test that writes a kept
failure's reasons, up to 1,000 per specification).

## Results

Same method as `eval/psets-cache-2026-11-18.md`: reports SHA-256 hashed with
`seconds` removed (`eval/heap-compare.mjs`, `maxFailed: 1000`), the 3 starter
and 65 public IDS files from `eval/fetch-audit-corpus.sh` (one public file is
not a readable IDS and fails the same way on both sides), models from
`opensourceBIM/IFC-files` at `cb96c50`, each parsed once. "main" is
`origin/main` at `bed94d087`, unpacked with `git archive`. Node 22, 4 vCPU,
two runs each, main and this change alternating.

| model | main | this change | reports |
|---|---|---|---|
| HHS MEP 39.6 MB | 6.3, 7.0 s; 633 MB RSS | 5.3, 5.0 s; 484 MB | identical |
| HHS architect 13.1 MB | 3.3, 3.1 s; 288 MB | 2.3, 2.4 s; 287 MB | identical |
| HHS construction 3.9 MB | 1.3, 1.1 s; 177 MB | 1.1, 1.0 s; 173 MB | identical |
| Schultz Residence 22.5 MB | 3.4, 3.4 s; 315 MB | 2.5, 2.5 s; 287 MB | identical |
| federated 219 MB, `--max-old-space-size=2048` | 60.4 s, 1,823 MB | 43.1 s, 1,714 MB | identical |
| federated 219 MB, `--max-old-space-size=1024` | 94.2, 100.5, 92.3 s (3 of 3 finish) | 54.8 to 57.0 s (6 of 6 finish) | identical |

A first round of the four smaller models, on the version before the heap
fix below, gave the same picture (HHS MEP 6.2-6.7 s against 4.5-4.7 s).

The federated model is `eval/federate.mjs` over the nine exports listed in
`eval/heap-200mb-2026-11-17.md` (3,671,279 entities, IFC2X3). One run at 2 GB; the 1 GB runs are listed one by one.

### Under a 1 GB heap

The 219 MB federated model with the 68 files only just fits a 1 GB heap on
main: 991 MB live after a forced collection at the end (measured with
`--expose-gc` after each file), peak 1,031-1,038 MB, 92-100 s of mostly
collection. The first version of the cache kept list results as arrays of
entity references and failed there: out of memory in 1 of 1 runs. Live
memory was 995 MB, 4 MB over main.

- With lists kept as `Int32Array` ids and left-out entities as file positions
  (off the JS heap), live memory was 991 MB, the same as main's. It still ran
  out of memory in 2 of 6 runs, and its sampled peak was 1,085 MB in every run
  that finished.
- The rest was `allBut` growing its 3.7 million entry list with `push`, which
  leaves each outgrown copy as garbage. Allocated at its final size, the peak
  is 1,039-1,041 MB, near main's, and 6 of 6 runs finished, in 54.8 to 57.0 s.

## Checks

- `node --test *.test.mjs`: 200 tests, 198 pass, 2 skipped (as before: they
  need fetched corpora).
- New `applies-cache.test.mjs`: five IDS files built to repeat facets (the
  same applicability in several specifications, a requirement equal to an
  applicability facet, a requirement written twice, the same facet under every
  cardinality, an entity requirement on a large pool, and facets that differ
  only in a value, a pattern or a data type), plus the three starter files,
  checked against one shared copy of `samples/tiny-house.ifc` and then each
  alone: every report equals the report of a fresh model with
  `facetCache: false`. A cached applicability result equals the walk's, in
  order, on the first call and the second. Nine planted faults each fail it:
  the key dropping `value`, `pattern` or `dataType`; the left-out positions
  ignored; a kept id list read back wrong;
  ABSENT stored for FAIL; and an entity, optional or prohibited requirement
  passing whatever its verdict. (Three weaker faults, which make a verdict
  say "fails" where it passes, do not change a report, as designed: the
  reasons pass re-tests and counts the element as passed. They only cost
  time.)
- Reports on all five models hash the same as main's.

## What is left

- The ifcXML reader still builds every entity up front (lazy ifcXML).
- `AttributeFacet.test` on every entity is still the largest self time on HHS
  MEP after the garbage collector (12.4% against 13.6%, profiled after the
  change), now for facets that differ by value (the fixture's three
  `attribute (any) = ...` requirements), which a verdict cache cannot share.
