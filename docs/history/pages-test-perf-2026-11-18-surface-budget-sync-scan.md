# surface-budget: a synchronous scan, read once per test file (2026-11-18)

Item 2 of the "not changed" list in
`pages-test-perf-2026-11-18-temp-dirs-and-one-read.md` named
`surface-budget.test.mjs` (19.5 s on CI) as unprofiled. Perf track, prompt 0.

## Reading

Local container, 4 cores, warm page cache, three runs each.

| measure | before | after | how |
|---|---:|---:|---|
| `node --test surface-budget.test.mjs` | 7.28 / 7.33 / 7.30 s | 1.57 / 1.56 / 1.55 s | `date +%s.%N` around the run |
| one `surfacesByVenture()` scan | 612 / 635 / 602 ms | 147 / 148 / 158 ms | `performance.now()` around the call, first scan after import |
| `node surface-budget.mjs --check` (the CLI CI runs) | 0.78 / 0.76 / 0.70 s | 0.27 / 0.27 / 0.32 s | `date +%s.%N` |

The scan walks 1,399 venture surfaces and reads 2,565 marketing pages. A
`node --cpu-prof` of one scan: 395 ms of its ~600 ms was `(idle)`, with the
rest spread over `openFileHandle`, `close`, `read`, `fstat` and `stat`. Every
`fs.readdir` and `fs.readFile` was awaited one after another, so the process
waited on the libuv thread pool for each of about 4,000 small operations.
`discoverSurfaces` itself (async `exists` per venture) took 67 ms and was
left alone.

The test file then ran that scan five times in-process (the override, live
budget, stale-override, tight-override and `--check` totals tests) plus five
CLI child processes, each scanning once, including `--for` with no slug,
which scanned the whole tree before printing its usage error.

## Change

1. `surfacesByVenture` reads listings and pages with `readdirSync` /
   `readFileSync`. The signature stays `async` (it still awaits
   `discoverSurfaces`), so no caller changes.
2. The test file scans the live tree once (`live()`, a memoised promise) and
   the five read-only tests share it. The unit tests that build their own
   fixture tree still scan their fixture.
3. `main` answers `--for` with no slug before scanning (same message, same
   exit 2).

## Verification

- `node surface-budget.mjs`, `--check` and `--for overtime-pay-calculator`:
  byte-identical stdout before and after (`cmp`; 331,117, 143 and 738 bytes).
- `--for` (exit 2, "needs a venture slug") and `--for nope` (exit 2, "no
  venture with a published entry point") unchanged.
- `node --test surface-budget.test.mjs`: 16 of 16 pass. No test removed or
  weakened; the shared scan is the same tree each test read before.

## Not changed, ranked for the next run

1. The five CLI tests still spawn five processes (~0.25 s each now). Running
   `main` in-process would need it to take a stdout/stderr sink; small.
2. `custom-domain.test.mjs`'s build (about 28 s), item 1 of the previous
   list, still stands.
3. Other `platform/pages` scripts with the same awaited-per-file pattern over
   the ventures tree have not been surveyed; `grep -n 'await fs.readFile'`
   in a loop is the signature to look for.
4. P063 and P064 remain owner-gated (workflow files).
