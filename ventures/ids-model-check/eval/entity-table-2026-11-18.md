# A smaller record per entity in the STEP reader (2026-11-18)

`eval/nested-early-2026-11-18.md` ended with: "On a federated file ... the
peak is the records themselves, not the tree. The next memory win there is a
smaller record per entity." This run makes the record smaller for STEP files,
which is how nearly every model reaches the checker.

## Where the bytes were

A heap snapshot of HHS Office `MEP.ifc` (665,224 entities) after parsing, on
main, grouped by constructor:

| what | main |
|---|---:|
| the file's text | 41.4 MB |
| `StepEntity` records, 665,225 of them | 37.3 MB (56 bytes each) |
| 552 large arrays, almost all the `entities` Map's hash table | 30.1 MB |
| other object element stores (byType lists, kept arguments) | 16.7 MB |

Two things stood out. Each record had four fields: `id`, `type`, `_p` (where
its arguments start) and `_a` (the arguments once read). And the Map that
holds the records by number cost about as much as the records: V8 sizes a
Map's table to a power of two, three slots an entry plus buckets, about 45
bytes an entity here.

## What changed (`step.mjs`)

- **Three fields, not four.** `_a` now holds the argument offset (a number)
  until the arguments are read and kept, then the arguments. `args`,
  `shallowArgs` and the keep policy for geometry work as before.
- **`EntityTable` instead of a Map.** STEP numbers are close to dense, so an
  entity sits at its number in a plain array (8 bytes a slot) and the file
  order is an `Int32Array` of numbers (4 bytes an entity). It answers `get`,
  `has`, `size`, `keys`, `values`, `entries`, `forEach` and iteration in file
  order, as the Map did. A second record with a number already read replaces
  the first in place, as `Map.set` did. Gaps are filled with `undefined`:
  writing far past an array's end makes V8 switch it to a hash table, larger
  than the Map. A number that is negative, not an integer, over 2^31 - 1, or
  more than a million past four times the count read so far, moves the table
  to a Map with the order kept, so any file still reads.

The ifcXML reader keeps its Map (it numbers provisionally, with negative
numbers, while it reads).

## Same reports

`eval/heap-compare.mjs` parses a model once and checks it against the three
starter IDS files and the 65 public ones (`eval/fetch-audit-corpus.sh`,
`maxFailed: 1000`), hashing every report with `seconds` removed. Main is
`origin/main` at `1ffdace56`, unpacked with `git archive`. Models from
`opensourceBIM/IFC-files` at `cb96c50` (fetch steps in
`model-attr-codes-2026-11-17.md`); the 219 MB federated model is built as in
`heap-200mb-2026-11-17.md`.

| model | hash, main | this change | 68 IDS, main | this change | peak heap in checks, main | this change |
|---|---|---|---:|---:|---:|---:|
| HHS MEP, 40 MB | f82ac50047fa0acb | f82ac50047fa0acb | 3.4 s | 3.2 s | 304 MB | 268 MB |
| Schultz Residence | cbd5a699ac4236af | cbd5a699ac4236af | 1.8 s | 1.9 s | 175 MB | 160 MB |
| HHS architect, 13 MB | bd146aa9d9d31968 | bd146aa9d9d31968 | 1.9 s | 1.9 s | 152 MB | 144 MB |
| federated, 219 MB | b3be49cdb18db81a | b3be49cdb18db81a | 32.5 s | 30.8 s | 1,244 MB | 1,204 MB |

Every report is identical. (One of the 65 public files is not a readable IDS
and fails the same way on both sides, as in earlier runs.)

## Memory

`node --expose-gc eval/retained-heap.mjs <dir> <model>`: heap kept after
parsing, the text excluded. `sh eval/min-heap.sh <dir> <model> STEP 0 HI`:
the smallest `--max-old-space-size` at which parsing finishes (16 MB steps,
64 MB for the federated model). Node v22, 4 vCPU. Single runs.

| model | entities | kept after parse, main | this change | smallest heap to parse, main | this change | parse, main | this change |
|---|---:|---:|---:|---:|---:|---:|---:|
| HHS MEP | 665,224 | 93 MB | 65 MB | 144 MB | 112 MB | 0.9 s | 0.6 s |
| HHS architect | 224,884 | 34 MB | 27 MB | 64 MB | 48 MB | 0.4 s | 0.3 s |
| Schultz Residence | 424,819 | 48 MB | 37 MB | 80 MB | 64 MB | 0.5 s | 0.4 s |
| federated, 219 MB | 3,671,279 | 444 MB | 350 MB | 704 MB | 576 MB | 4.9 s | 3.4 s |

The federated model with the three starter IDS files now finishes under a
704 MB heap; main needed 832 MB (`eval/heap-compare.mjs` as the script).
With all 68 IDS files the peak is set by what the checks build (the facet
cache and the reports), not by the records, so it moved only 40 MB.

On MEP after the change the snapshot shows `StepEntity` at 31.9 MB (48 bytes
each) and the large Map arrays gone; the element stores rose to 23.7 MB (the
number-indexed array and order list).

## Checks

- `node --test entity-table.test.mjs`: 5 tests compare the table with a Map
  on the same inserts (out of order, gaps, a repeated number, numbers that
  move it to a Map, an order list past its first block), and pin
  `parseStep`'s order for a repeated number and the offset-then-arguments
  field.
- Planted faults, each run against `entity-table.test.mjs` and
  `engine.test.mjs`:

  | planted fault | tests failed |
  |---|---|
  | a repeated number appended to the order again | 2 |
  | negative numbers kept in the array | 1 |
  | order reversed when moving to a Map | 1 |
  | geometry's arguments kept (policy ignored) | 2 |
- `node --test '*.test.mjs'`: 208 pass, 2 skipped (as before).

## What is left

- With many IDS files on a large model the peak is the checks' own
  structures (1.2 GB of heap on the federated model with 68 IDS); that is
  the next place to look, not the records.
- A record could go further: no object at all for an entity no check reads
  (number, type index and offset in typed arrays, the object made on first
  `get`). That needs `byType` and the walks over every entity to hold
  numbers, not objects, which touches most of `ids.mjs`.
