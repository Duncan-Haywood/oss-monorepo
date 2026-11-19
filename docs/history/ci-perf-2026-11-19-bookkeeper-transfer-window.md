# ai-bookkeeper: transfers paired inside a date window, one copy of the books per import (2026-11-19)

Perf track, prompt 0. Both perf backlog items (P063, P064) touch CODEOWNERS
paths and wait for the owner. `venture_suite_times.json` puts league,
shift-roster and shed first, and all three have had several passes. This run
timed einvoice-preflight file by file first and then went to ai-bookkeeper.
The 2026-11-16 keyword-hits pass ranked "`clone` in `engine.mjs`" first among
the things it did not change.

## Reading

- `suite_file_times.py einvoice-preflight --jobs 4`: 270 files, 12.0 s wall,
  44.7 s summed. The slowest file took 1.1 s, so the suite is Node start-up
  bound and there was nothing to fix. (The tool exited 1, but
  `run_venture_tests.py einvoice-preflight` passes 2,744 tests. Some file
  the table folded into "(255 more)" fails when it runs alone. Not chased.)
- ai-bookkeeper's suite is fast per file, so this pass measured what a user
  waits for instead: a scratch script builds a year of books with
  `importStatement` + `confirm`, one month at a time, 1,500 lines a month on
  one bank account (18,000 lines by December). Before the change it took
  **2.80 to 3.27 s** (6 runs), and an import got slower every month: 165 ms in
  January, 516 to 620 ms in December.
- `node --cpu-prof`, self time: **`pairTransfers` 1,243 ms**, `clone` 709 ms,
  GC 344 ms, `suggest` 159 ms. Nothing else was over 50 ms.

`pairTransfers` tested every open inflow against every open outflow. That is
quadratic in the open lines, and lines that are only suggested, not
confirmed, stay open. So every `categorize` re-ran it over the whole year.
`importStatement` and `confirm` each `clone`d the books and then called
`categorize`, which cloned them again.

## Change (`ventures/ai-bookkeeper/engine.mjs`)

- `pairTransfers`: outflows are sorted by day once. Each inflow bisects to
  `day - days` and scans only to `day + days`. A pair can only form within
  `days`, so the candidate set is the same. Each candidate also keeps its
  inflow and outflow index, and the sort breaks (gap, diff) ties by them,
  which reproduces the order the all-pairs loop pushed (a stable sort of a-major,
  b-minor order). Lines with an unparseable date never paired before
  (`NaN <= days` is false) and are left out of the window. `days` is passed
  through `Number()` for the window bounds, so a typed `"5"` cannot turn
  `day + days` into string concatenation. The `gap <= days` check is kept as
  it was.
- `categorize` is now `categorizeOwn(clone(books))`. `importStatement` and
  `confirm` call `categorizeOwn` on the copy they already made.

## Verification

- New `pair-transfers-window.test.mjs`: 1,500 random books (one to four
  accounts, some not bank accounts, foreign lines in two currencies, 3% bad
  dates, every status, `days` in {5, 0, 2, 31, "5", 1.5, -1, Infinity}). The
  pair count and the books (deep equal) match an inline copy of the old
  all-pairs loop, with more than 1,000 transfers paired. A second test pins
  tie order. With the index tie-break removed from the sort, both tests fail.
- A scratch run of the same check on 4,000 books: all equal, 16,134 candidate
  pairs.
- A lockstep scratch run of old and new engines: 36 `importStatement` +
  `confirm` steps on three bank accounts, with running balances, splits and
  1,276 paired transfers. Every result was `isDeepStrictEqual`, error
  messages included. This also covers the dropped second clone: no undefined
  field or shared reference shows up differently in memory.
- The year-of-books scripts end with identical SHA-256 digests of the books
  JSON before and after (`aa79b9f1…` for one account, `e21c9016…` for three).
- `python3 platform/ci/run_venture_tests.py ai-bookkeeper`: ok, 3,402 tests,
  0 failed (24.1 s).

## After

| measure (scratch script, 4 cores, idle) | before | after |
| --- | --- | --- |
| a year, one bank account, 18,000 lines, import + confirm monthly (6 runs before, 3 after) | 2.80 to 3.27 s | 1.22 to 1.35 s |
| December's import + confirm on that year | 516 to 620 ms | 163 to 185 ms |
| a year, three bank accounts, 17,649 lines, 7,466 paired transfers, imports only | 2.73 to 2.92 s | 1.47 to 1.64 s |

The suite's wall time is unchanged within noise: its fixtures are small and
it is start-up bound. This pass is for the person whose books grow through
the year in the browser tab.

## Not changed, ranked for the next run

1. `clone` is still one `JSON.parse(JSON.stringify())` of the whole books per
   import, confirm and `analyze`. It is now about 0.35 s of the 18,000-line
   year. A copy-on-write of `transactions` would need every writer audited
   (the 2026-11-16 note still holds).
2. `categorize` re-suggests every open line on every pass, including lines
   suggested in earlier months whose inputs have not changed. `suggest` is
   about 160 ms self over the year. Memoising by (line, model version) would
   need the model to carry a version.
3. `settle` (accruals.mjs) clones again when the books hold documents. It was
   not measured, because the benchmark has no invoices.
