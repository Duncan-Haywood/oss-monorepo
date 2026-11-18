# Venture suites: the .xls reader pads wide rows in one go (ai-bookkeeper, 2026-11-13)

Perf track, prompt 0. Both open perf backlog items (P063, P064) change workflow
files and wait for the owner, so this run took item 3 of "Where to look": the
slowest local step a session waits on, here the venture suites.

## Reading: every venture suite

`python3 platform/ci/run_venture_tests.py --slowest 40 --no-elsewhere`, this
container (4 cores), 2026-11-13: 1,345 suites, 0 failed, 13 m 47 s wall,
46 m 15 s user. The slowest:

| venture | s (4 suites at once) | perf passes before this one |
|---|---:|---|
| changepoint-detector | 525.7 | several (pelt, trend fit, median select) |
| shift-roster-builder | 470.9 | 2026-11-11, 2026-11-12 |
| shed-designer | 469.1 | several (browser tests, bbox loops) |
| league-schedule-generator | 287.2 | 2026-11-11, 2026-11-12 (x3) |
| wall-framing-takeoff | 162.7 | none |
| ai-bookkeeper | 156.4 | none |

The top four have had passes and their own docs say the rest of their time is
spread over many files. wall-framing-takeoff is spread too: of 142 test files,
the longest are `cli-sweep` (14.7 s) and `mutation-sweep` (10.6 s). In
ai-bookkeeper one file stood out: `xls-receipts-fuzz.test.mjs` took **19.1 s**
of the suite (308 files; the next was 4.1 s), almost all of it in one test, "a
damaged .xls is read or refused" (19,185 ms; the receipt test is 0.35 s).

## Profile

A bench script (scratch, not committed) replays that test's 300 damaged files
(same seed, same damage) through `xlsToCsv` and hashes every output or error
message. Old reader: **18.7 to 19.3 s**, hash `11b53ea5a508f684`. 14 of the 300
files take more than 50 ms; 13 of them take 0.8 to 1.8 s, and each of those
returns a CSV of 9.8 to 19.8 MB.

`node --cpu-prof`, self time: `xlsToCsv` 13.9 s (the row writer's `Array.from`
callback, inlined), its CSV `join` 3.1 s, GC 1.0 s, `csvCell` 1.0 s.

Why: damage of the "four 0xff bytes" kind can land on a cell record's column
field, so one cell claims column 65535. The writer pads every row to the widest
row, cell by cell: each of the sheet's rows became 65,536 `csvCell("")` calls
and a 65,536-element join.

## Change

`ventures/ai-bookkeeper/xls.mjs`: write each row's own cells as before, then pad
with `",".repeat(width - r.length)`. A row exists only once a cell is put in it,
so it has at least one cell, and `L` cells joined plus `width - L` commas is
exactly the `width - 1` commas the old join wrote, with empty cells between. The
reader's output does not change.

The fuzz test gained an invariant that pins the padding: every line of a read
CSV has the same number of fields (one linear pass, quotes respected). It passes
on the old reader and the new one, and fails ("rows of 1, 2, 4 fields") if the
padding is removed. A first version split lines with a quote-aware lookahead
regex. That is quadratic on a 20 MB string and took the file to 52 s, so it was
replaced by the one-pass counter before landing.

## After

| measure | before | after | how |
|---|---:|---:|---|
| bench, 300 damaged files | 18.7 / 19.3 s | 1.30 / 1.31 s | two runs each, alternating, same hash `11b53ea5a508f684` |
| `xls-receipts-fuzz.test.mjs` | 20.2 s | 2.2 s | `time node --test --test-reporter=dot <file>`, after the new invariant |
| ai-bookkeeper suite alone | 45.2 s | 27.6 s | `run_venture_tests.py ai-bookkeeper`, one after the other |

The page imports the same `xls.mjs`, so a visitor who drops a damaged .xls of
this kind now waits about 1.5 s less for the same result.

## Not changed, ranked for the next run

1. **A damaged .xls still turns into a 20 MB CSV of commas** that the statement
   reader then parses. Refusing (or clipping) a cell whose column is far past
   every other cell would be the product fix. That changes the output, so it
   needs a product decision and a test, and it is not a perf change.
2. wall-framing-takeoff (163 s in the sweep) has no file over 15 s. Most of its
   time is 142 Node start-ups and the `cli-sweep` / `mutation-sweep` files.
   Profile those two before anything else.
3. ai-bookkeeper's next files are `fuzz.test.mjs` (4.1 s) and
   `import-order-property.test.mjs` (3.3 s), both small.
4. The top four suites (changepoint-detector, shift-roster-builder,
   shed-designer, league-schedule-generator) are still 75% of the sweep's
   suite-seconds. Their latest docs say no single file dominates.
5. P063 and P064 remain owner-gated (workflow files).
