# The checks' own memory: exact-length lists, shared values, relationships not kept (2026-11-18)

`eval/entity-table-2026-11-18.md` ended with: "With many IDS files on a large
model the peak is the checks' own structures (1.2 GB of heap on the
federated model with 68 IDS); that is the next place to look." This run
looked, and the premise was wrong in a useful way.

## What the 1.2 GB was

The 1.2 GB came from `eval/heap-compare.mjs`, which samples `heapUsed`
every 20 ms. That counts garbage not yet collected, and the script itself
makes some: it hashes `JSON.stringify` of every report, and on the
federated model each report carries the model's duplicate-GlobalId list
(the model repeats HHS MEP twice), 23 MB of JSON, 68 times. The sampler
also cannot fire during a check, which is synchronous. So the number that
matters is the smallest `--max-old-space-size` at which the run finishes:
`sh eval/min-heap.sh` (32 MB steps) with a script that parses once and
checks the 68 files without hashing (`eval/checks-only.mjs`).

On main (`88b875001`), the 219 MB federated model: parsing needs 576 MB;
parsing and the 68 checks need **896 MB**.

## Where the checks' 320 MB went

After the 68 checks and a full GC the heap held 258 MB more than after
parsing. Nearly all of it was entity arguments kept once read (the reader
keeps every type's arguments but geometry's). Dropping them by group after
the run (`gc()` between):

| kept arguments of | entities | heap freed |
|---|---:|---:|
| relationships (read at parse by the index) | 128,012 | 67 MB |
| properties and quantities | 373,321 | 109 MB |
| property sets | 117,279 | 64 MB |
| representations, placements, maps | 89,295 | 34 MB |
| the rest | 42,334 | 17 MB |

A heap snapshot of HHS MEP after the 68 checks said why the arguments were
so large: the backing stores of arrays grew by 25 MB for 163,000 new lists,
about 150 bytes each for lists of four or five items. A list built by `push`
starts with room for 16 items, so a four-item argument list held 128 bytes of
pointers for 32 bytes of data.

## What changed

- **Lists copied to their length** (`step.mjs`, `Reader.list` and
  `shallowList` return `out.slice()`), and the Model's index lists
  (`psetRels`, `parents`, `byType` and the rest) copied once indexing is
  done.
- **Repeated small values shared** (`step.mjs`, `Interner`, one per parsed
  model): a typed value with a scalar value (`IFCBOOLEAN(.T.)`,
  `IFCLABEL('Steel')`, `IFCLENGTHMEASURE(0.2)`) is one frozen object per
  type and value, enumerations one frozen object per name, `*` and `.U.` one
  each, and strings up to 64 characters one copy each. Each table stops
  growing at 65,536 entries, so a model of unique strings costs no more than
  before. Typed lists are not shared. The eager reader and ifcXML are
  unchanged.
- **Relationships not kept** (`ids.mjs`, the Model's keep policy): the index
  reads each relationship once at parse, and nothing reads a relationship's
  arguments again (searched: every `Relating*`/`Related*` read is in
  `Model._index`). A specification that names a relationship class still
  reads its arguments, from the text.

Relationships not kept alone, before the other two, cost nothing in time and
saved 67 MB after parse. Not keeping property and quantity arguments as well
saved 109 MB more but made the 68 checks on the federated model 17% slower
(12.1 to 14.2 s), and with property sets too 39% (to 16.8 s; HHS MEP 2.2 to
3.6 s): they re-read every property's name for each element. So they stay
kept, in the smaller form.

## Same reports

`eval/heap-compare.mjs`, 3 starter + 65 public IDS (`eval/fetch-audit-corpus.sh`,
fetched today), `maxFailed: 1000`, every report hashed with `seconds`
removed. Main is `origin/main` at `88b875001` unpacked with `git archive`.
Models from `opensourceBIM/IFC-files` at `cb96c50`; the federated model
built as in `heap-200mb-2026-11-17.md` (219,033,563 bytes, 3,671,279
entities). Node 22.23.5, 4 vCPU. Single runs.

| model | report hash, main | this change | 68 IDS, main | this change |
|---|---|---|---:|---:|
| HHS MEP, 40 MB | 76056db9a88300a5 | 76056db9a88300a5 | 2.9 s | 3.0 s |
| Schultz Residence | ed94b668af17dd6b | ed94b668af17dd6b | 1.5 s | 1.7 s |
| HHS architect | b935a4c00a874c41 | b935a4c00a874c41 | 1.7 s | 1.7 s |
| federated, 219 MB | c2c7db876b0e6ae0 | c2c7db876b0e6ae0 | 28.6 s | 26.0 s |

(The hashes differ from `entity-table-2026-11-18.md`'s: the public IDS files
are fetched at each repository's HEAD, and the reports gained the ids.xsd
structure warnings since.) Every lazily read argument also equals the eager
reader's, which shares nothing: 665,224 of 665,224 entities on HHS MEP,
424,819 on Schultz, 224,884 on HHS architect (`isDeepStrictEqual`).

## Memory

| federated, 219 MB | main | this change |
|---|---:|---:|
| smallest heap to parse | 576 MB | **512 MB** |
| smallest heap, parse + 3 starter IDS | 704 MB | **576 MB** |
| smallest heap, parse + all 68 IDS | 896 MB | **704 MB** |
| heap kept after parse (`eval/retained-heap.mjs`) | 350 MB | 273 MB |
| heap after the 68 checks, after GC | 835 MB | 636 MB |

| model | kept after parse, main | this change | after 68 IDS and GC, main | this change |
|---|---:|---:|---:|---:|
| HHS MEP | 65 MB | 51 MB | 161 MB | 121 MB |
| Schultz Residence | 37 MB | 35 MB | 71 MB | 68 MB |
| HHS architect | 27 MB | 21 MB | 64 MB | 50 MB |

(The "after" columns include the file's text.) The browser page
(`eval/heap-page-run.mjs`, the starter IDS, Chromium's V8 heap capped) gives
the same result on the federated model on both sides down to a 512 MB cap,
so that test does not separate them; it took 3.3-3.8 s here against main's
2.9-3.2 s, single runs.

## Checks

- `node --test shared-values.test.mjs` (4 tests): lazy, shared values equal
  the eager reader's on every entity of the four bundled models; a typed
  value with the same type and scalar is one frozen object, and the type
  name, `1` against `'1'`, and lists keep values apart; the tables stop at
  their cap and go on answering, and long strings are not kept; a
  relationship's arguments are not kept but read the same again, geometry's
  not kept, rooted objects' kept.
- Planted faults, each run against `shared-values.test.mjs`,
  `engine.test.mjs` and `entity-table.test.mjs`:

  | planted fault | tests failed |
  |---|---|
  | typed values shared by value alone, type name ignored | 1 |
  | relationships kept | 1 |
  | strings over 64 characters shared | 1 |
  | no cap on the tables | 1 |
  | lists not copied (memory only; no test can see it) | 0 |
- `node --test '*.test.mjs'`: 224 pass, 2 skipped.

## What is left

- Property and quantity arguments are still kept (109 MB before this change
  on the federated model, now smaller): not keeping them cost 17-39% in
  time. A compact per-property-set record (names and values, no argument
  lists) read once might keep the speed at a fraction of the memory.
- The page's time on the federated model looked 10-15% slower in single
  runs while Node's was not; worth repeated runs before reading anything
  into it.
