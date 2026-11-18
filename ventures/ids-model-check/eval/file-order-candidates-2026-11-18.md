# Specifications with no entity facet: a candidate list in file order (2026-11-18)

`eval/psets-cache-2026-11-18.md` left this open: "`applies` still walks every
entity for a specification with no entity facet. Each step is now one lookup,
but a candidate list in file order (an ordinal per entity) would skip the
walk." This run builds that list and measures what it buys.

## What changed (`ids.mjs`)

- **A candidate list per facet** (`facetCandidates`). Each prefilter already
  reads one index; the same index names every entity the prefilter can pass:
  property (the `psetHolders` lists of the set names the facet takes),
  classification (own associations, external references, typed occurrences),
  material (own association, typed occurrences), partOf (the chosen
  relationships' part maps), attribute (the classes that have an attribute by
  that name, counted before the list is built). `applies` takes the smallest.
  A superset would be safe, since the pool is still filtered by every
  prefilter and every facet's own test; leaving an entity out would not.
- **Back into file order** (`fileOrder`). The report keeps the first 1,000
  failures, so the order must be the walk's. The id cannot stand in for it:
  **none of the four real exports numbers its entities in file order** (HHS
  MEP, architect, construction, Schultz Residence, and the repository's own
  `tiny-house.ifc`; only the ifcXML twin does). The position of each entity in
  the entities Map is built once per model, only when a specification needs a
  pool: an `Int32Array` indexed by id when ids are dense integers (4 bytes per
  id, 18.6 MB on the federated model, highest id 4,639,936 for 3,671,279
  entities), else a Map.
- **The walk stays** where the smallest list is over half the model (an
  attribute facet whose name matches every class, for one) or where no facet names a list.

## Results

`node eval/file-order-candidates.mjs MODEL samples/*.ids.xml eval/corpus/real/*.ids`
times `applies` alone on the 37 specifications with no usable entity facet in
the 68 IDS files (three starters, the 65 public ones `eval/fetch-audit-corpus.sh`
fetches), walk against pool, median of three, and checks that both give the
same entities in the same order. Models: opensourceBIM/IFC-files at `cb96c50`
(fetch steps in `model-attr-codes-2026-11-17.md`); the federated model is
`eval/federate.mjs` over the nine files `heap-200mb-2026-11-17.md` names.
Node 22, 4 vCPU.

| model | entities | applies, walk | applies, pool | same entities, same order |
|---|---:|---:|---:|---|
| HHS MEP 39.6 MB | 665,224 | 2,664 ms | 2,130 ms | yes |
| HHS architect 13.1 MB | 224,884 | 997 ms | 783 ms | yes |
| HHS construction 3.9 MB | 67,898 | 275 ms | 184 ms | yes |
| Schultz Residence 22.5 MB | 424,819 | 1,659 ms | 1,154 ms | yes |
| federated 219 MB (`--max-old-space-size=4096`) | 3,671,279 | 20,928 ms | 16,816 ms | yes |

Split on HHS MEP: the 24 specifications that take a pool (432,576 applicable
elements between them) go from 896 to 305 ms, 2.9 times faster; the 13 that
still walk (8,647,906 applicable: they apply to most of the model, so the
facets' own tests on every element are the cost, not the walk) go from 1,817
to 1,887 ms, the pools' setup plus noise. On the federated model the same 24
go from 6,121 to 2,156 ms (2,212,936 applicable) and the 13 from 14,578 to
14,106 ms.

Whole runs (`eval/heap-compare.mjs`, reports SHA-256 hashed with `seconds`
removed, `maxFailed: 1000`, main at `9db671599` unpacked with `git archive`,
two runs each, alternating):

| model | main | this branch | reports |
|---|---|---|---|
| HHS MEP | 7.1, 6.5 s | 7.2, 6.4 s | identical (`f82ac500`) |
| HHS architect | 3.3, 3.0 s | 3.0, 3.0 s | identical (`bd146aa9`) |
| HHS construction | 1.1, 1.3 s | 1.1, 1.3 s | identical (`e0067816`) |
| Schultz Residence | 3.5, 3.6 s | 3.0, 3.4 s | identical (`cbd5a699`) |
| federated 219 MB (Node's default heap, one run each) | 56.2 s, 2,896 MB RSS | 49.6 s, 2,918 MB | identical (`b3be49cd`) |

So, honestly: on the four single exports the saving (0.1 to 0.5 s of
`applies`) is inside the run-to-run noise of a whole run, where parsing and
the specifications that apply to most of the model dominate. On the federated model, where each walk is 3.7 million entities, the whole run went from 56.2 to 49.6 s in one run each; the 4.0 s `applies` saving above accounts for most of that, the rest is run-to-run noise. RSS rose 22 MB, about the file-order array.

## Checks

- `node --test *.test.mjs`: 197 tests, 195 pass, 2 skipped (the two that
  need fetched corpora).
- New `file-order-candidates.test.mjs`: a model whose ids run against file
  order (later records carry lower numbers), 20 applicability sets with no
  entity facet (each facet kind, patterns, a classification and a material
  reached only through a door's type, voids/fills, any-name attributes,
  combinations). For each, `applies` gives exactly the ids, in order, that
  every entity run through the facets' own tests gives (no prefilter, no
  pool), and so does the walk. Three planted faults each fail it: the
  classification list without typed occurrences, the material list without
  them, a property list missing its first holder; and a fourth, the pool left
  unsorted.
- Every report on all five models hashes the same as main's.

## What is left

- Specifications that apply to most of the model (any-name attribute facets,
  OpenAEC's `entity (any)` fixture) cost their full tests on every element;
  only a cache of facet results across specifications would cut that.
- At 1 GB the federated run is still close to the limit (991 MB live at the
  end in the last note); the file-order array adds 18.6 MB when built.
- The ifcXML reader still builds every entity up front.
