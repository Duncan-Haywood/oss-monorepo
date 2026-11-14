# Perf: ai-bookkeeper finds its columns in one pass over the header (2026-11-14)

Perf track, prompt 0. The two perf backlog items (P063, P064) are owner-gated
workflow edits, so this run read the venture suites again and took the slowest
one with a single-function hot spot.

## Reading

- `run_venture_tests.py --slowest 30 --jobs 8` (this container, 4 cores, so
  heavily oversubscribed), the first suites to finish: ai-bookkeeper 253 s,
  wall-framing-takeoff 231 s, clothing-design-studio 151 s, chant-forge 92 s,
  einvoice-preflight 83 s. Killed after 152 suites; the biggest four
  (changepoint-detector, league-schedule-generator, shift-roster-builder,
  shed-designer) were still running.
- ai-bookkeeper alone: `run_venture_tests.py ai-bookkeeper`, **29.1 / 29.3 s**.
  311 test files; four at a time, the slowest were `fuzz` 27 s,
  `import-order-property` 18 s, `metamorphic` 17 s, `estimatedtax-property`
  17 s. One at a time: `fuzz` 4.5 s, `import-order-property` 3.5 s,
  `metamorphic` 2.6 s.
- `node --cpu-prof fuzz.test.mjs`, self time of 5.2 s: `detectColumns`'
  inner `find` 0.89 s, `detectColumns` 0.72 s, GC 0.40 s, `norm` 0.36 s, the
  currency-suffix regex 0.32 s. About half the profile was column detection.

`ALIASES` lists several hundred header names (date, description, amount,
debit, credit, balance in some 30 languages). `find` tried each alias with
`h.indexOf`, so one call cost aliases x cells. `readStatement` asks
`detectColumns` of every row until one is a header; a file with no header row
(CBA, ANZ, Wells Fargo exports) asks it of every row, three times
(`rows.some(hasHeader)` twice and a `findIndex`). The currency-suffix regex
(`Amount USD`, `Betrag in EUR`) ran once per cell per missing key, up to four
times per cell.

## Change (`ventures/ai-bookkeeper/bank.mjs`)

1. **`aliasColumns(h)`**: a map from each alias to its rank in each key's list,
   built once; one pass over the cells keeps, per key, the cell with the
   lowest rank, first position winning a tie. That is the same answer as "the
   first alias, in list order, that `indexOf` finds".
2. **The currency regex runs once per cell** and the four keys read the cached
   matches (the regex has no `g` flag, so `exec` is pure).
3. **`readStatement` memoises the "names a date and an amount" test per row**
   (a `Map` keyed by the row array). Nothing changes a row's cells between the
   three scans; the `length < 2` guard stays where it was (the `findIndex`
   never had it, and still does not).

## Verification

- Bench (scratch, `bench.mjs`): every text fixture read whole, 40 seeded
  mutations of each read (the `fuzz.test.mjs` mutator), and `detectColumns`
  on the first 30 lines of each fixture split on `,;\t`, forwards and
  reversed; sha256 over `JSON.stringify` of every result. Seeds 7, 1, 2, 3:
  `b28ff34d028f8363`, `e45f931a630e0ba2`, `df4de3b78be46819`,
  `30afe278753d55c1` before and after. **5.1 to 5.6 s before, 2.5 to 2.7 s
  after** (3.6 s in one run with another job on the machine).
- New `alias-columns.test.mjs`: the old `indexOf` loop written out against the
  exported `COLUMN_ALIASES`, compared with `aliasColumns` on 4,000 seeded
  headers mixing every alias, repeats and unknown names, plus every alias alone
  and beside each key's first alias; and a sparse header row. A mutant that
  lets a later cell win a tie (`<=`) fails it.
- `run_venture_tests.py ai-bookkeeper`: ok, **29.1 / 29.3 s before, 28.7 /
  28.9 s after.** The suite is 311 Node start-ups four at a time, so one
  file's 1.8 s barely shows.
- Per file, one at a time: `fuzz` 4.5 s to 2.7 s, `import-order-property`
  3.5 s to 3.2 s, `metamorphic` 2.6 s to 2.2 s.
- **What a visitor waits on** (the page imports the same `bank.mjs`): a
  synthetic 5,000-row statement, mean of 5 reads after a warm-up, same output
  length. With a header row: 64 ms before, 70 ms after (noise). **With no
  header row (CBA style): 261 ms before, 78 ms after.**

## Not changed, ranked for the next run

1. **ai-bookkeeper's wall time is start-up bound**: 311 files, none over 3.2 s
   alone. Merging files would cut start-ups but loses the per-file isolation
   the suite relies on; measure `node --test` with several files per process
   before proposing it.
2. **changepoint-detector per file** (four at a time, so inflated about 3x):
   `engine` 53 s, `engine-trend-bends` 42 s, `engine-trend-joint-knots` 35 s,
   `quiet-series` 29 s, `drift-warning-null195-ar1` 26 s, `watch-workflow`
   23 s; 551 file-seconds in all. Profile `engine-trend-bends` alone first.
3. `detectColumns`' long chain of `h.includes(...)` vendor checks (about 60,
   each O(cells)) is now the largest part of what remains of it; a `Set` of the
   cells would be exact but the win is small at real header widths.
4. P063 and P064 remain owner-gated (workflow files).
